import { SKILLS, SKILL_DOMAINS, SKILL_FAMILIES, canonicalSkill, normaliseSkillText } from './criteria-referential.js'
import { SHARED_BASE_MIN_WORKSPACES, SHARED_SIZE_BANDS, isSharedToken } from './shared-anonymous-base.js'

/**
 * #4286.15.c — `market_pattern` : LES TENDANCES DE MARCHÉ ENTRE ESPACES.
 *
 * DÉCISION LOUIS 22/10/2026 (épopée « Base commune », origine #4268.1, suite de #3989) — registre :
 * `c127_market_pattern_tendances_entre_espaces`. Le 19/10 avait tranché QUE les tendances profitent à
 * tous les espaces ; le 22/10 dit COMMENT :
 *
 * - **des agrégats sur jetons FERMÉS** — une cellule ne se coupe que par secteur (division NAF),
 *   taille de la maison (TPE / PME / ETI / GE), région administrative et famille de métier recruté
 *   (les domaines du référentiel de compétences). Tous viennent de référentiels existants ;
 * - **publié à trois espaces au moins** — la constante UNIQUE {@link SHARED_BASE_MIN_WORKSPACES}
 *   (k-anonymat), redite par le CHECK SQL et ici à la lecture ;
 * - **jamais** un coût, un prix, un TJM, un nom d'espace ou de client, un contenu de message, de note
 *   ou de CRM — la forme de la ligne est FERMÉE ({@link toMarketPatternLine} refuse toute autre clé) ;
 * - **un compte, jamais un taux** ni une probabilité ; le libellé dit ce qu'on SAIT, « observé dans N
 *   espaces », jamais ce que le marché FAIT (GA-259).
 *
 * Pur et testé à part : c'est la règle qui décide ce qu'un espace voit des autres. Garde :
 * `ga-416-market-pattern-agregat-ferme.spec.ts`.
 */

/** La table des agrégats — inscrite dans `SHARED_AGGREGATE_TABLES` (GA-43 la relit). */
export const MARKET_PATTERN_TABLE = 'shared_market_pattern_aggregates'

/** La nature de signal lue : un recrutement repéré par l'analyse (`signalKindSchema`). */
export const MARKET_PATTERN_SIGNAL_TYPE = 'recrutement'

/**
 * Une tendance, pas une archive : un recrutement repéré depuis plus de six mois ne dit plus ce qui
 * bouge. Six mois couvrent un cycle d'appel d'offres et le délai d'une ouverture de poste à son
 * pourvoi ; plus court, un secteur peu suivi ne franchirait jamais les trois espaces.
 */
export const MARKET_PATTERN_WINDOW_DAYS = 180

/** Les familles de métier recruté : les domaines du référentiel de compétences (`SKILL_DOMAINS`), écrits ici en
 *  liste fermée pour que la contrainte SQL se compare au TypeScript (GA-12) — le test redit l'égalité. */
export const MARKET_PATTERN_SKILL_DOMAINS = [
  'web',
  'mobile',
  'systemes',
  'data',
  'cloud',
  'securite',
  'progiciels',
  'pilotage',
] as const
export type MarketPatternSkillDomain = (typeof MARKET_PATTERN_SKILL_DOMAINS)[number]

/** Les treize régions administratives de métropole (réforme territoriale 2016), en jetons. */
export const FRENCH_REGIONS = [
  'ile_de_france',
  'auvergne_rhone_alpes',
  'hauts_de_france',
  'pays_de_la_loire',
  'nouvelle_aquitaine',
  'occitanie',
  'provence_alpes_cote_d_azur',
  'grand_est',
  'bretagne',
  'normandie',
  'centre_val_de_loire',
  'bourgogne_franche_comte',
  'corse',
] as const
type FrenchRegion = (typeof FRENCH_REGIONS)[number]

/**
 * Les départements de chaque région — un FAIT géographique, stable. Source unique (GA-26) : le
 * critère géographique des comptes similaires (`similar-scoring.ts`) la lit aussi.
 */
export const FRENCH_REGION_DEPARTMENTS: Readonly<Record<FrenchRegion, readonly string[]>> = {
  ile_de_france: ['75', '77', '78', '91', '92', '93', '94', '95'],
  auvergne_rhone_alpes: ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'],
  hauts_de_france: ['02', '59', '60', '62', '80'],
  pays_de_la_loire: ['44', '49', '53', '72', '85'],
  nouvelle_aquitaine: ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'],
  occitanie: ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'],
  provence_alpes_cote_d_azur: ['04', '05', '06', '13', '83', '84'],
  grand_est: ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'],
  bretagne: ['22', '29', '35', '56'],
  normandie: ['14', '27', '50', '61', '76'],
  centre_val_de_loire: ['18', '28', '36', '37', '41', '45'],
  bourgogne_franche_comte: ['21', '25', '39', '58', '70', '71', '89', '90'],
  corse: ['20'],
}

const REGION_OF_DEPARTMENT: ReadonlyMap<string, FrenchRegion> = new Map(
  FRENCH_REGIONS.flatMap(region => FRENCH_REGION_DEPARTMENTS[region].map(department => [department, region] as const)),
)

/**
 * La région d'une adresse, lue dans son code postal de métropole (01000-95999). Pas de code postal,
 * un code d'outre-mer, ou un département inconnu = `null` : la ligne ne compte que dans « toutes
 * régions », rien n'est deviné.
 */
export function regionKeyOfAddress(address: string | null | undefined): FrenchRegion | null {
  const match = /(?:^|\D)((?:0[1-9]|[1-8]\d|9[0-5])\d{3})(?!\d)/.exec(address ?? '')
  return match ? (REGION_OF_DEPARTMENT.get((match[1] ?? '').slice(0, 2)) ?? null) : null
}

/**
 * #4982.3b — le LIEU ÉCRIT (« Paris, Île-de-France, France », « Lyon ») quand il n'y a pas de code postal.
 * Référentiel FERMÉ ville→département (préfectures de région + grandes métropoles) : source unique (GA-26), le SQL du
 * tri/répartition « zone » de l'API en est GÉNÉRÉ. Une ville s'égale entièrement après normalisation, jamais une
 * sous-chaîne (« Lyonnais » ≠ Lyon).
 */
export const FRENCH_CITY_DEPARTMENTS: Readonly<Record<string, string>> = {
  paris: '75',
  lyon: '69',
  marseille: '13',
  toulouse: '31',
  lille: '59',
  bordeaux: '33',
  nantes: '44',
  strasbourg: '67',
  rennes: '35',
  nice: '06',
  montpellier: '34',
  grenoble: '38',
  rouen: '76',
  dijon: '21',
  orleans: '45',
  ajaccio: '20',
  metz: '57',
  tours: '37',
  'clermont ferrand': '63',
  caen: '14',
  brest: '29',
  'le mans': '72',
  reims: '51',
  'saint etienne': '42',
  toulon: '83',
  angers: '49',
  'aix en provence': '13',
  villeurbanne: '69',
  nanterre: '92',
  'boulogne billancourt': '92',
  'issy les moulineaux': '92',
  courbevoie: '92',
  'la defense': '92',
  puteaux: '92',
  'levallois perret': '92',
  'neuilly sur seine': '92',
  'saint denis': '93',
  montrouge: '92',
  massy: '91',
  versailles: '78',
  'sophia antipolis': '06',
}

/** Les noms d'une région dans un lieu écrit (FR et EN), déjà normalisés (voir `normalisePlaceText`). */
export const FRENCH_REGION_NAMES: Readonly<Record<FrenchRegion, readonly string[]>> = {
  ile_de_france: ['ile de france'],
  auvergne_rhone_alpes: ['auvergne rhone alpes'],
  hauts_de_france: ['hauts de france'],
  pays_de_la_loire: ['pays de la loire'],
  nouvelle_aquitaine: ['nouvelle aquitaine'],
  occitanie: ['occitanie', 'occitania'],
  provence_alpes_cote_d_azur: ['provence alpes cote d azur'],
  grand_est: ['grand est'],
  bretagne: ['bretagne', 'brittany'],
  normandie: ['normandie', 'normandy'],
  centre_val_de_loire: ['centre val de loire'],
  bourgogne_franche_comte: ['bourgogne franche comte', 'burgundy franche comte'],
  corse: ['corse', 'corsica'],
}

/** Les pays (FR et EN, normalisés) dont le nom écarte un lieu : « Paris, Texas, United States » n'est pas Paris. */
export const FOREIGN_COUNTRY_NAMES: readonly string[] = [
  'united states',
  'usa',
  'etats unis',
  'united kingdom',
  'uk',
  'royaume uni',
  'england',
  'angleterre',
  'germany',
  'allemagne',
  'spain',
  'espagne',
  'italy',
  'italie',
  'belgium',
  'belgique',
  'switzerland',
  'suisse',
  'luxembourg',
  'canada',
  'netherlands',
  'pays bas',
  'portugal',
  'ireland',
  'irlande',
  'morocco',
  'maroc',
  'tunisia',
  'tunisie',
  'algeria',
  'algerie',
  'senegal',
  'cote d ivoire',
  'india',
  'inde',
  'china',
  'chine',
  'japan',
  'japon',
  'singapore',
  'singapour',
  'australia',
  'australie',
  'brazil',
  'bresil',
  'mexico',
  'mexique',
  'poland',
  'pologne',
  'sweden',
  'suede',
  'denmark',
  'danemark',
  'norway',
  'norvege',
  'austria',
  'autriche',
  'romania',
  'roumanie',
]

/** Minuscules, sans accents, tout ce qui n'est ni lettre ni chiffre devient UNE espace (tirets, apostrophes, virgules). */
export function normalisePlaceText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export type PlaceZone = { region: FrenchRegion; department: string | null }

/**
 * #4982.3b — la zone d'un lieu écrit, dans l'ordre : (1) code postal de métropole ; (2) NOM d'une région ;
 * (3) grande ville de métropole NOMMÉE comme ville (`city` ou 1er segment de `location`). Un autre pays nommé,
 * ou rien de reconnu = `null`, jamais deviné. Miroir TS du SQL généré par l'API (mêmes constantes).
 */
export function placeZoneOf(place: {
  city?: string | null
  location?: string | null
  country?: string | null
  postalCode?: string | null
}): PlaceZone | null {
  const written = `${place.postalCode ?? ''} ${place.city ?? ''} ${place.location ?? ''}`
  const postal = /(?:^|\D)((?:0[1-9]|[1-8]\d|9[0-5])\d{3})(?!\d)/.exec(written)
  const postalDepartment = postal ? (postal[1] ?? '').slice(0, 2) : null
  const postalRegion = postalDepartment ? (REGION_OF_DEPARTMENT.get(postalDepartment) ?? null) : null
  if (postalRegion) return { region: postalRegion, department: postalDepartment }

  const text = ` ${normalisePlaceText(`${place.city ?? ''} ${place.location ?? ''} ${place.country ?? ''}`)} `
  if (FOREIGN_COUNTRY_NAMES.some(name => text.includes(` ${name} `))) return null

  const cityName = normalisePlaceText(
    (place.city ?? '').trim() !== '' ? place.city : (place.location ?? '').split(',')[0],
  )
  const cityDepartment = Object.hasOwn(FRENCH_CITY_DEPARTMENTS, cityName)
    ? (FRENCH_CITY_DEPARTMENTS[cityName] ?? null)
    : null
  const cityRegion = cityDepartment ? (REGION_OF_DEPARTMENT.get(cityDepartment) ?? null) : null

  const named = FRENCH_REGIONS.find(region => FRENCH_REGION_NAMES[region].some(name => text.includes(` ${name} `)))
  if (named) return { region: named, department: cityRegion === named ? cityDepartment : null }
  return cityRegion && cityDepartment ? { region: cityRegion, department: cityDepartment } : null
}

/**
 * La famille de métier d'un intitulé d'offre : d'abord les termes de recherche du domaine
 * (« data engineer »), puis la compétence canonique (« React » → JavaScript et front → web). Hors
 * référentiel = `null`, jamais deviné. L'intitulé est LU ici, il n'est jamais écrit : seul le jeton sort.
 */
export function skillDomainOfJobTitle(title: string | null | undefined): MarketPatternSkillDomain | null {
  const text = normaliseSkillText(title ?? '')
  if (!text) return null
  for (const domain of MARKET_PATTERN_SKILL_DOMAINS) {
    if (SKILL_DOMAINS[domain].searchTerms.some(term => ` ${text} `.includes(` ${normaliseSkillText(term)} `))) {
      return domain
    }
  }
  const skill = canonicalSkill(text)
  if (!skill) return null
  const family = (SKILLS as Readonly<Record<string, { family: string }>>)[skill]?.family
  const domain = family ? (SKILL_FAMILIES as Readonly<Record<string, { domain: string }>>)[family]?.domain : undefined
  return (MARKET_PATTERN_SKILL_DOMAINS as readonly string[]).includes(domain ?? '')
    ? (domain as MarketPatternSkillDomain)
    : null
}

/** Ce qu'on SAIT, jamais ce que le marché FAIT (GA-259). */
export function marketPatternObservedLabel(contributingWorkspaces: number): string {
  return `observé dans ${contributingWorkspaces} espaces`
}

type MarketPatternLine = {
  topic: MarketPatternSkillDomain
  sectorKey: string
  sizeBand: string
  regionKey: string
  observations: number
  contributingWorkspaces: number
  observedIn: string
}

/** Les SEULES clés d'une cellule publiable — toute autre (coût, prix, TJM, nom, note…) la fait refuser. */
const MARKET_PATTERN_LINE_KEYS: ReadonlySet<string> = new Set([
  'topic',
  'sectorKey',
  'sizeBand',
  'regionKey',
  'observations',
  'contributingWorkspaces',
])

const ALL = 'all'

/**
 * La porte de PUBLICATION d'une cellule : `null` dès qu'elle est portée par moins de trois espaces,
 * qu'elle porte une clé hors de sa forme fermée, ou qu'une catégorie sort de son vocabulaire.
 */
export function toMarketPatternLine(cell: Readonly<Record<string, unknown>>): MarketPatternLine | null {
  if (Object.keys(cell).some(key => !MARKET_PATTERN_LINE_KEYS.has(key))) return null
  const { topic, sectorKey, sizeBand, regionKey, observations, contributingWorkspaces } = cell
  if (typeof contributingWorkspaces !== 'number' || contributingWorkspaces < SHARED_BASE_MIN_WORKSPACES) return null
  if (typeof observations !== 'number' || !Number.isInteger(observations) || observations <= 0) return null
  if (!(MARKET_PATTERN_SKILL_DOMAINS as readonly unknown[]).includes(topic)) return null
  if (typeof sectorKey !== 'string' || !(sectorKey === ALL || /^naf_\d{2}$/.test(sectorKey))) return null
  if (!(sizeBand === ALL || (SHARED_SIZE_BANDS as readonly unknown[]).includes(sizeBand))) return null
  if (!(regionKey === ALL || (FRENCH_REGIONS as readonly unknown[]).includes(regionKey))) return null
  if (!isSharedToken(sectorKey) || typeof sizeBand !== 'string' || typeof regionKey !== 'string') return null
  return {
    topic: topic as MarketPatternSkillDomain,
    sectorKey,
    sizeBand,
    regionKey,
    observations,
    contributingWorkspaces,
    observedIn: marketPatternObservedLabel(contributingWorkspaces),
  }
}
