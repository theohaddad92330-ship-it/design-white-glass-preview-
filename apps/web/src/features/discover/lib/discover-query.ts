import { type DiscoverEntityType, nafCodesForSectors } from '@bellum/contracts'
import { parseAmount, parseDepartments } from './discover-registry-vocab'
import { STARTUP_SEGMENT_HEADCOUNT } from './discover-size-bounds'
import type {
  CityRadiusOption,
  CompanyAgeBucket,
  DiscoverRegistryFilters,
  DiscoverRegistryQuery,
  DiscoverSignalsQuery,
  HeadcountRange,
  SignalSource,
  SiteBasisOption,
} from './discover-types'
import { NEED_PERIOD_ALL, type NeedNature, type NeedsPeriod } from './discover-needs-filters'
import { DEFAULT_CITY_RADIUS_KM, DEFAULT_SIGNAL_SOURCES, SIGNAL_SOURCES } from './discover-types'

/* ------------------------------------------------------------------ */
/*  Filtres d'écran → corps de requête Découvrir.                       */
/*                                                                     */
/*  L'écran v1 concaténait ces mêmes champs dans une phrase française   */
/*  (« secteur : Finance · ville : Lyon ») envoyée en texte libre à un  */
/*  prompt : les filtres ne filtraient rien. Ici chaque contrôle        */
/*  alimente un champ NOMMÉ du contrat, et rien d'autre.                */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Secteurs — la taxinomie a DÉMÉNAGÉ                                  */
/*                                                                     */
/*  `SECTOR_KEYS`, `SELECTABLE_SECTORS`, `matchSectorKeys`,            */
/*  `SECTOR_SECTION`, `sectionsForSectors` et `nafSectionOf` vivaient   */
/*  ici. C'était une SECONDE liste de secteurs, propre à Découvrir, et  */
/*  ses dix entrées n'étaient que les dix GROUPES du vocabulaire        */
/*  partagé recopiés à la main — avec d'autres libellés, et une maille  */
/*  bornée à la SECTION NAF. Un secteur comme « Aéronautique » n'y      */
/*  existait pas, et « Industrie » valait les divisions 10 à 33.        */
/*                                                                     */
/*  La taxinomie est désormais celle de tout Bellum                     */
/*  (`APPLICATION_SECTORS`, 41 secteurs), et ses codes NAF vivent dans  */
/*  `APPLICATION_SECTOR_NAF`. Ce qui reste propre à l'écran est dans    */
/*  `discover-sectors.ts`. On retire le MOYEN, pas seulement l'usage :  */
/*  laisser l'ancienne liste exportée garantissait qu'un écran futur    */
/*  la rebranche.                                                       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Département                                                        */
/* ------------------------------------------------------------------ */

/** 01-95, 2A/2B (Corse), 971-976 (DOM). */
const DEPARTMENT_RE = /^(?:0[1-9]|[1-8]\d|9[0-5]|2[AB]|97[1-6])$/

/**
 * Premier code département exploitable de la saisie, ou `undefined`.
 *
 * Les deux endpoints prennent UN département (`department`, au singulier) : si
 * le commercial en colle plusieurs, on garde le premier plutôt que d'envoyer un
 * critère que le backend ignorerait. Un chiffre seul est complété (« 1 » → 01).
 */
export function parseDepartment(raw: string): string | undefined {
  for (const token of raw.split(/[\s,;]+/)) {
    const trimmed = token.trim().toUpperCase()
    if (!trimmed) continue
    const padded = /^\d$/.test(trimmed) ? `0${trimmed}` : trimmed
    if (DEPARTMENT_RE.test(padded)) return padded
  }
  return undefined
}

/* ------------------------------------------------------------------ */
/*  Cible structurée (ex-« registre »)                                 */
/* ------------------------------------------------------------------ */

export interface RegistryFilters {
  /** Secteurs CROISÉS (multi), dans le vocabulaire PARTAGÉ de Bellum
   *  (`APPLICATION_SECTORS`, 41 secteurs). Vide = aucune contrainte.
   *
   *  ⚠️ C'étaient les dix anciennes clés de Découvrir, qui n'étaient en réalité
   *  que les dix GROUPES recopiés à la main. Une recherche enregistrée avant le
   *  04/09/2026 en porte encore : `migrateLegacySectors` les convertit. */
  sectors: string[]
  /** Code NAF saisi à la main — champ distinct du secteur côté contrat. */
  nafCode: string
  /** Saisie libre : UN ou PLUSIEURS départements. Le registre en accepte
   *  nativement une liste, et le champ invitait déjà à en coller plusieurs
   *  (virgules, espaces) — il n'en honorait qu'un, sans le dire. */
  department: string
  /** #2642.1 — codes de région INSEE COCHÉS (rail : IDF + Occitanie ensemble).
   *  Vide = aucune contrainte. Comme `department`, le registre en accepte
   *  nativement une liste (voir {@link buildRegistryQuery}). */
  region: string[]
  /** Chiffre d'affaires, saisi en euros. Chaîne, pas nombre : un champ vide
   *  doit rester VIDE, et `0` est un montant vrai qu'on ne peut pas confondre
   *  avec « non renseigné ». */
  revenueMin: string
  revenueMax: string
  /** Catégorie INSEE cochée (PME / ETI / GE). Vide = aucune contrainte. */
  companyCategory: string[]
  /** Code INSEE de forme juridique. Vide = aucune contrainte. */
  legalForm: string
  city: string
  /** #2642.2 — un CERCLE autour de `city`. `'any'` = pas de contrainte. Sans
   *  effet SEUL : un rayon n'a pas de centre sans ville — voir
   *  {@link buildRegistryQuery}. */
  cityRadiusKm: CityRadiusOption
  /** #3983.2 — la base de la zone département/région : siège ou implantation
   *  (défaut). Sans zone, rien à baser : voir {@link buildRegistryQuery}. */
  siteBasis: SiteBasisOption
  /** #3908 — PLUSIEURS tranches cochables (cumul, union). Vide = aucune
   *  contrainte ; `'any'` n'est jamais un élément du tableau (c'est l'absence
   *  de contrainte elle-même, voir {@link HEADCOUNT_RANGES}). */
  headcount: HeadcountRange[]
  age: CompanyAgeBucket
  freetext: string
  /** #2165.28 — pile technique OBSERVÉE (mémoire marché), saisie libre comme
   *  `nafCode` : virgules/espaces, parsée par {@link parseTechnologiesObserved}. */
  technologiesObserved: string
  /** #2165.30 — au moins une ESN OBSERVÉE sur ce compte. `false` n'est jamais
   *  envoyé (doctrine c65, GA-259) : voir {@link buildRegistryQuery}. */
  externalRecourseObserved: boolean
  /** #4632.2 — famille de rôles OBSERVÉE (mémoire marché) : envoyée, l'API CLASSE la liste (jamais d'exclusion). */
  roleFamilyObserved?: string
  /** #4632.2 — écosystème lié à (ESN observée) : même mécanisme que `roleFamilyObserved`. */
  ecosystemObserved?: string
  /** #5203 — période des besoins (`all` = rien n'est retiré, jamais envoyé) et natures retenues. */
  needsPeriod?: NeedsPeriod
  needsNature?: NeedNature[]
  /** #4361.2 — « Exclure les sociétés cotées ». `false` n'est jamais envoyé (voir
   *  {@link buildRegistryQuery}) : décoché n'affirme pas « non coté ». */
  excludeListed: boolean
}

/** #5203 — ⚠️ « Tous » (défaut) n'est JAMAIS envoyé : aucune borne d'âge (décision 31/10) ; seul un choix RETIRE. */
function needsQueryPart(filters: { needsPeriod?: NeedsPeriod; needsNature?: NeedNature[] }) {
  return {
    ...(filters.needsPeriod && filters.needsPeriod !== NEED_PERIOD_ALL ? { needsPeriod: filters.needsPeriod } : {}),
    ...(filters.needsNature?.length ? { needsNature: filters.needsNature } : {}),
  }
}

export const DISCOVER_PAGE_SIZE = 24

export function emptyRegistryFilters(): RegistryFilters {
  return {
    sectors: [],
    nafCode: '',
    department: '',
    region: [],
    revenueMin: '',
    revenueMax: '',
    companyCategory: [],
    legalForm: '',
    city: '',
    cityRadiusKm: DEFAULT_CITY_RADIUS_KM,
    siteBasis: 'presence',
    headcount: [],
    age: 'any',
    freetext: '',
    technologiesObserved: '',
    externalRecourseObserved: false,
    excludeListed: false,
  }
}

/**
 * #2165.28 — texte libre → liste de technologies, même découpage que
 * `manualNafPrefixes` (`discover-filters.ts`) : virgules, points-virgules,
 * espaces. Un jeton vide est jeté plutôt que d'envoyer un critère sur rien.
 */
export function parseTechnologiesObserved(raw: string): string[] {
  const out: string[] = []
  for (const token of raw.split(/[,;]+/)) {
    const trimmed = token.trim()
    if (trimmed && !out.includes(trimmed)) out.push(trimmed)
  }
  return out
}

/** Secteurs réellement contraignants d'une sélection (« all »/doublons retirés).
 *  « all » n'a jamais été une valeur : c'est l'ABSENCE de contrainte, et le
 *  garder ferait compter un filtre qui ne filtre rien. */
export function activeSectors(sectors: readonly string[]): string[] {
  const kept: string[] = []
  for (const sector of sectors) {
    if (sector && sector !== 'all' && !kept.includes(sector)) kept.push(sector)
  }
  return kept
}

/** Tranche d'écran → bornes numériques. `1000+` n'a volontairement pas de max. */
export const HEADCOUNT_BOUNDS: Record<HeadcountRange, { headcountMin?: number; headcountMax?: number }> = {
  any: {},
  '1-9': { headcountMin: 1, headcountMax: 9 },
  '10-49': { headcountMin: 10, headcountMax: 49 },
  '50-249': { headcountMin: 50, headcountMax: 249 },
  '250-999': { headcountMin: 250, headcountMax: 999 },
  '1000+': { headcountMin: 1000 },
  // #4361.1 — la borne du préréglage « Middle market » : 250 à 4 999 (au-delà, grande entreprise).
  '250-4999': { headcountMin: 250, headcountMax: 4999 },
}

/** Tranches réellement contraignantes d'une sélection (`'any'` retiré, dédupliqué). */
export function activeHeadcountRanges(headcount: readonly HeadcountRange[]): HeadcountRange[] {
  const kept: HeadcountRange[] = []
  for (const range of headcount) {
    if (range !== 'any' && !kept.includes(range)) kept.push(range)
  }
  return kept
}

/**
 * #3908 — sélection de tranches → critère(s) de la requête registre.
 *
 * Une tranche seule envoie `headcountMin`/`headcountMax` tels qu'avant
 * (comportement inchangé, à l'octet). Deux tranches ou plus — non contiguës,
 * comme « 10-49 » + « 250-499 » — ne peuvent PAS se réduire à un seul
 * intervalle : envelopper (min du plus bas, max du plus haut) ferait remonter
 * aussi la tranche intermédiaire jamais cochée. `headcountRanges` porte alors
 * l'UNION exacte ; le registre (côté IA) l'étend lui-même en codes de tranche
 * INSEE, qu'il sait déjà unir (`tranche_effectif_salarie=code1,code2`).
 */
function headcountQueryPart(
  headcount: readonly HeadcountRange[],
): Pick<DiscoverRegistryFilters, 'headcountMin' | 'headcountMax' | 'headcountRanges'> {
  const ranges = activeHeadcountRanges(headcount)
  if (ranges.length === 0) return {}
  if (ranges.length === 1) return HEADCOUNT_BOUNDS[ranges[0]]
  return { headcountRanges: ranges.map(range => HEADCOUNT_BOUNDS[range]) }
}

/** Décale une date de `years` années en arrière → `YYYY-MM-DD` (UTC). */
function yearsAgo(nowMs: number, years: number): string {
  const d = new Date(nowMs)
  d.setUTCFullYear(d.getUTCFullYear() - years)
  return d.toISOString().slice(0, 10)
}

/**
 * Ancienneté → fenêtre de création absolue.
 *
 * Le contrat parle en DATES, pas en âge : on convertit ici une fois, plutôt que
 * de laisser chaque appelant faire son arithmétique.
 */
function creationWindow(
  age: CompanyAgeBucket,
  nowMs: number,
): Pick<DiscoverRegistryFilters, 'createdAfter' | 'createdBefore'> {
  switch (age) {
    case 'lt3':
      return { createdAfter: yearsAgo(nowMs, 3) }
    case '3to10':
      return { createdAfter: yearsAgo(nowMs, 10), createdBefore: yearsAgo(nowMs, 3) }
    // #3941.1 — seuil Jeune Entreprise Innovante (CGI art. 44 sexies-0 A), pas un chiffre deviné.
    case 'lt8':
      return { createdAfter: yearsAgo(nowMs, 8) }
    case 'gt10':
      return { createdBefore: yearsAgo(nowMs, 10) }
    default:
      return {}
  }
}

/**
 * #3941.1 — le préréglage « Startup » (#3092 : « Laura confond startups et
 * micro-entreprises »).
 *
 * TROIS critères, tous DÉJÀ dans le registre — aucune nouvelle collecte
 * (c'est le chantier SIGNAUX, hors de ce lot) : moins de 8 ans (seuil JEI, pas
 * un âge deviné), forme SAS/SASU (code INSEE `5710` — la quasi-totalité des
 * jeunes sociétés françaises, à la différence de l'entreprise individuelle
 * `1000` qui FAIT la micro-entreprise que le client voyait remonter), et
 * catégorie PME (exclut ETI/GE : une startup n'est pas une grande entreprise).
 * Pas de critère de levée : aucune source ne la porte encore (épopée à ouvrir,
 * #3091) — on ne l'affiche donc jamais comme si on l'avait.
 *
 * Un préréglage, pas un cinquième champ caché : il ÉCRIT dans les trois champs
 * que le rail affiche déjà, donc rien n'est appliqué sans se voir (même
 * contrainte que `companyCategory`, jamais un défaut silencieux).
 */
export const STARTUP_SEGMENT_LEGAL_FORM = '5710'
export const STARTUP_SEGMENT_AGE: CompanyAgeBucket = 'lt8'
// #4362.1 — la taille du préréglage s'écrit en tranches VISIBLES au rail (`STARTUP_SEGMENT_HEADCOUNT`), plus en catégorie cachée.

export function applyStartupSegment(filters: RegistryFilters): RegistryFilters {
  return {
    ...filters,
    age: STARTUP_SEGMENT_AGE,
    legalForm: STARTUP_SEGMENT_LEGAL_FORM,
    headcount: [...new Set([...filters.headcount, ...STARTUP_SEGMENT_HEADCOUNT])],
  }
}

/** Les trois champs du préréglage sont-ils TOUJOURS ceux posés ci-dessus —
 *  jamais un sous-ensemble, qui dirait « actif » sur un réglage que
 *  l'utilisateur a changé depuis (ex. repassé l'âge à « tous »). */
export function isStartupSegmentActive(filters: RegistryFilters): boolean {
  return (
    filters.age === STARTUP_SEGMENT_AGE &&
    filters.legalForm === STARTUP_SEGMENT_LEGAL_FORM &&
    STARTUP_SEGMENT_HEADCOUNT.every(range => filters.headcount.includes(range))
  )
}

/**
 * Filtres d'écran → corps de `POST /ia/discover/registry`.
 *
 * Chaque champ vide est OMIS (pas de `''` ni de `null` transmis) : ce que le
 * backend reçoit est exactement ce que l'utilisateur a demandé, ce qui rend le
 * `query` renvoyé (« critères effectivement appliqués ») lisible.
 *
 * Le secteur part en CODES NAF (`nafCode`), pas en `sectors[]` : voir le
 * commentaire dans le corps.
 */
export function buildRegistryQuery(
  filters: RegistryFilters,
  nowMs: number = Date.now(),
  // #2291.9 — le volume PROPOSÉ, adapté à la capacité commerciale déclarée
  // (`discover-capacity.ts`). Défaut inchangé : `DISCOVER_PAGE_SIZE`.
  limit: number = DISCOVER_PAGE_SIZE,
  // #4045.1 — les mots-clés de la recherche (rail commun aux deux modes) : ils TRIENT
  // les signaux de chaque compte côté serveur, ne retirent aucune entreprise et ne
  // rendent JAMAIS une requête lançable à eux seuls (voir `isRegistryQueryRunnable`).
  keywords: string = '',
): DiscoverRegistryQuery {
  const keywordList = keywords
    .split(/[,;]+/)
    .map(word => word.trim())
    .filter(Boolean)
  const city = filters.city.trim()
  const freetext = filters.freetext.trim()
  // #2642.2 — un rayon SANS ville n'a pas de centre : il ne part jamais seul.
  const radiusKm = city && filters.cityRadiusKm !== 'any' ? Number(filters.cityRadiusKm) : undefined
  // ⚠️ TOUS les départements, plus seulement le premier : le registre en accepte
  // une liste (`departement=31,33` → 142, contre 97 et 45 séparément).
  const departments = parseDepartments(filters.department)
  // #2642.1 — TOUTES les régions cochées, plus seulement une : le registre en
  // accepte une liste (`region=11,76` → 341, contre 220 et 156 séparément).
  const region = filters.region.filter(code => code.trim())
  const revenueMin = parseAmount(filters.revenueMin)
  const revenueMax = parseAmount(filters.revenueMax)
  const companyCategory = filters.companyCategory.filter(Boolean)
  const legalCategory = filters.legalForm.trim()
  const sectors = activeSectors(filters.sectors)
  const technologiesObserved = parseTechnologiesObserved(filters.technologiesObserved)

  // ── Le secteur part en CODES NAF, plus en section ────────────────────────
  //
  // Avant : `sectors` voyageait tel quel et le backend le traduisait en une
  // SECTION NAF (`industry` → `C`, divisions 10 à 33). Un fabricant de
  // dispositifs médicaux remontait donc sous le filtre d'un avionneur.
  //
  // Maintenant chaque secteur porte ses codes de classe, et le registre les
  // accepte en une seule requête — mesuré le 04/09/2026 :
  // `30.30Z,29.10Z` → 1423 = 745 + 678, c'est un OU.
  //
  // ⚠️ Le code NAF saisi À LA MAIN se joint aux codes des secteurs par ce même
  // OU, parce que c'est la seule chose que le registre sache faire en un appel.
  // Cocher « Aéronautique » ET taper « 62.01Z » rend donc les deux, jamais leur
  // intersection. C'est aussi la lecture attendue : deux façons de dire « ce
  // terrain m'intéresse ».
  const manualNaf = filters.nafCode
    .trim()
    .toUpperCase()
    .split(/[\s,;]+/)
    .filter(Boolean)
  const naf = [...new Set([...manualNaf, ...nafCodesForSectors(sectors)])].join(',')

  return {
    filters: {
      ...(naf ? { nafCode: naf } : {}),
      // `department` (singulier) reste envoyé pour Pappers, qui n'en prend
      // qu'un ; `departments` porte la liste que gouv.fr sait honorer.
      ...(departments.length ? { department: departments[0], departments } : {}),
      // `region` (singulier) reste envoyé pour Pappers, qui n'en prend qu'un
      // (et ne l'honore de toute façon jamais, voir `_unhonoured_by` côté IA) ;
      // `regions` porte la liste que gouv.fr sait honorer.
      ...(region.length ? { region: region[0], regions: region } : {}),
      ...(revenueMin !== undefined ? { revenueMin } : {}),
      ...(revenueMax !== undefined ? { revenueMax } : {}),
      ...(companyCategory.length ? { companyCategory } : {}),
      ...(legalCategory ? { legalCategory } : {}),
      ...(city ? { city } : {}),
      ...(radiusKm !== undefined ? { radiusKm } : {}),
      // #3983.2 — seul `headquarters` part (`presence` est le défaut du
      // registre), et seulement sur une ZONE : sans département ni région il n'y
      // a rien à baser, et le critère enverrait la recherche ailleurs pour rien.
      ...(filters.siteBasis === 'headquarters' && (departments.length || region.length)
        ? { siteBasis: 'headquarters' as const }
        : {}),
      ...headcountQueryPart(filters.headcount),
      ...creationWindow(filters.age, nowMs),
      ...(freetext ? { freetext } : {}),
      ...(keywordList.length ? { keywords: keywordList } : {}),
      ...(technologiesObserved.length ? { technologiesObserved } : {}),
      ...(filters.roleFamilyObserved?.trim() ? { roleFamilyObserved: filters.roleFamilyObserved.trim() } : {}),
      ...(filters.ecosystemObserved?.trim() ? { ecosystemObserved: filters.ecosystemObserved.trim() } : {}),
      ...needsQueryPart(filters),
      // #2165.30 — ⚠️ Seul `true` est envoyé. `false` n'est jamais un critère
      // (doctrine c65, GA-259) : l'omettre laisse le filtre inactif, jamais
      // l'inverse « sans recours externe ».
      ...(filters.externalRecourseObserved ? { externalRecourseObserved: true } : {}),
      // #4361.2 — ⚠️ Seul `true` est envoyé : l'omettre laisse le filtre inactif, jamais l'inverse.
      ...(filters.excludeListed ? { excludeListed: true } : {}),
    },
    limit,
  }
}

/** Au moins un critère réel — sinon la requête est un dump de registre. */
export function isRegistryQueryRunnable(filters: RegistryFilters): boolean {
  return Object.keys(buildRegistryQuery(filters).filters).length > 0
}

/* ------------------------------------------------------------------ */
/*  Signaux d'intention                                               */
/* ------------------------------------------------------------------ */

export interface SignalsFilters {
  sources: SignalSource[]
  department: string
  sinceDays: number
  keywords: string
  /** Le RETOURNEMENT (tome 4) : lire le marché CLIENT, le marché ESN, ou les
   *  deux. `all` par défaut — une recherche qu'on n'a pas restreinte ne doit
   *  rien retirer. */
  entityType: DiscoverEntityType
  /**
   * Les SECTEURS du rail — commun aux deux modes, donc applicable aux deux.
   *
   * Ils manquaient ici, et c'est ce qui rendait le filtre Secteur **totalement
   * muet** en mode Signaux : `signalsPart` les laissait tomber, `buildSignalsQuery`
   * ne les sérialisait pas, le serveur ne les recevait donc jamais — donc aucune
   * entrée `degraded`, donc aucune note à côté du filtre. L'utilisateur cochait
   * « Industrie » et il ne se passait rien, sans un mot.
   *
   * Côté registre le critère était au moins ENVOYÉ (puis jeté par Pappers) ;
   * ici il n'existait pas. C'est le pire des deux moitiés du défaut.
   */
  sectors: string[]
  /** #2165.28 — même critère, même mécanisme que `RegistryFilters`. */
  technologiesObserved: string
  /** #2165.30 — même critère, même mécanisme que `RegistryFilters`. */
  externalRecourseObserved: boolean
  /** #4632.2 — famille de rôles OBSERVÉE (mémoire marché) : envoyée, l'API CLASSE la liste (jamais d'exclusion). */
  roleFamilyObserved?: string
  /** #4632.2 — écosystème lié à (ESN observée) : même mécanisme que `roleFamilyObserved`. */
  ecosystemObserved?: string
  /** #5203 — même critère que `RegistryFilters`. */
  needsPeriod?: NeedsPeriod
  needsNature?: NeedNature[]
  /**
   * #3096 — RÉFUTÉ en prod le 27/09 : manquait ici, donc `buildSignalsQuery`
   * ne pouvait pas la sérialiser — voir `DiscoverSignalsQuery.remotePolicies`.
   */
  remotePolicies: Array<'sur_site' | 'hybride' | 'full_remote'>
  /** #3097 — même défaut, même mécanisme, pour la séniorité recherchée. */
  seniorities: Array<'junior' | 'confirme' | 'senior'>
  /**
   * #3226 (#3203.6) — même défaut, même mécanisme, pour le delivery fit
   * externe.
   */
  deliveryFitFilter: Array<'compatible' | 'potentially_compatible' | 'unknown' | 'incompatible'>
}

export const RECENCY_WINDOWS = [30, 90, 180] as const

export function emptySignalsFilters(): SignalsFilters {
  return {
    sources: [...DEFAULT_SIGNAL_SOURCES],
    department: '',
    sinceDays: 90,
    keywords: '',
    entityType: 'all',
    sectors: [],
    technologiesObserved: '',
    externalRecourseObserved: false,
    remotePolicies: [],
    seniorities: [],
    deliveryFitFilter: [],
  }
}

/**
 * Filtres d'écran → corps de `POST /ia/discover/signals`.
 *
 * Une sélection vide retombe sur les trois sources : « aucune source cochée »
 * ne doit pas produire silencieusement zéro résultat.
 */
export function buildSignalsQuery(
  filters: SignalsFilters,
  // #2291.9 — même volume adapté que `buildRegistryQuery` ci-dessus.
  limit: number = DISCOVER_PAGE_SIZE,
): DiscoverSignalsQuery {
  const selected = SIGNAL_SOURCES.filter(source => filters.sources.includes(source))
  const department = parseDepartment(filters.department)
  const keywords = filters.keywords.trim()
  // ⚠️ Les secteurs ne sont PLUS sérialisés ici, et c'est un gain, pas une perte.
  //
  // Le serveur ne connaît que les dix anciennes clés larges, qu'il traduit en
  // sections NAF ; il ne sait rien des 41 secteurs partagés. Lui envoyer
  // `aerospace` ne filtrerait rien (`unknown_sectors` : un secteur inconnu ne
  // filtre RIEN plutôt que de vider la liste en silence).
  //
  // Le filtrage se fait donc à l'écran, sur le code NAF que CHAQUE candidat de
  // signal porte déjà — `passesSectors` compare par PRÉFIXE. C'est strictement
  // plus fin que la section d'avant : « Aéronautique » ne ramène plus toute
  // l'industrie manufacturière.

  return {
    sources: selected.length > 0 ? selected : [...DEFAULT_SIGNAL_SOURCES],
    ...(department ? { department } : {}),
    ...(keywords ? { keywords } : {}),
    sinceDays: filters.sinceDays,
    limit,
    // `all` n'est pas sérialisé : une valeur par défaut envoyée à chaque appel
    // finirait par ressembler à un choix, et le serveur a déjà le même défaut.
    ...(filters.entityType !== 'all' ? { entityType: filters.entityType } : {}),
    ...(parseTechnologiesObserved(filters.technologiesObserved).length
      ? { technologiesObserved: parseTechnologiesObserved(filters.technologiesObserved) }
      : {}),
    ...(filters.roleFamilyObserved?.trim() ? { roleFamilyObserved: filters.roleFamilyObserved.trim() } : {}),
    ...(filters.ecosystemObserved?.trim() ? { ecosystemObserved: filters.ecosystemObserved.trim() } : {}),
    ...needsQueryPart(filters),
    // #2165.30 — ⚠️ Seul `true` est envoyé — voir `buildRegistryQuery`.
    ...(filters.externalRecourseObserved ? { externalRecourseObserved: true } : {}),
    // #3096 / #3097 — le serveur les applique AVANT de tronquer à `limit` :
    // les omettre ici, comme avant ce lot, tronquait la page sans jamais
    // tenir compte du choix (voir `DiscoverSignalsQuery`).
    ...(filters.remotePolicies.length > 0 ? { remotePolicies: filters.remotePolicies } : {}),
    ...(filters.seniorities.length > 0 ? { seniorities: filters.seniorities } : {}),
    // #3226 (#3203.6) — même raison que remotePolicies/seniorities ci-dessus.
    ...(filters.deliveryFitFilter.length > 0 ? { deliveryFitFilter: filters.deliveryFitFilter } : {}),
  }
}
