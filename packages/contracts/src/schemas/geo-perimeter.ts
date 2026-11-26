import type { AnalysisScopeSelection } from './analysis.js'

/**
 * #4044 — LE test « cette personne est-elle hors du périmètre géographique choisi ? », UN seul
 * endroit (GA-26). Il vivait dans l'API (`analysis-scope.ts`) ; l'écran Opportunités du compte
 * (qui propose des contacts par signal) doit lire le MÊME verdict que l'écartement fait à
 * l'analyse, pas une seconde copie des listes de pays qui diverge un jour.
 */

export function normalizeScopeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Pays hors France, par aire — mêmes mots que `apps/ia/app/services/scope_filter.py`
 * (`_NON_FRANCE_RE` / `_EUROPE_RE`), pour qu'une personne soit lue pareil des deux côtés.
 */
const EUROPE_COUNTRIES =
  'united kingdom|uk|royaume uni|london|londres|germany|allemagne|spain|espagne|italy|italie|belgium|belgique|' +
  'netherlands|pays bas|luxembourg|suisse|switzerland|poland|pologne|portugal|ireland|irlande|austria|autriche|' +
  'sweden|suede|norway|norvege|denmark|danemark|finland|finlande|romania|roumanie|greece|grece|czech republic|' +
  'tchequie|hungary|hongrie|bulgaria|bulgarie|croatia|croatie|' +
  // #4044 — le pays et la ville écrits DANS LA LANGUE du pays (« Deutschland », « España », « München ») :
  // une fiche collectée côté local ne dit presque jamais « Germany ».
  'deutschland|espana|italia|nederland|belgie|osterreich|schweiz|suisse romande|polska|sverige|norge|danmark|suomi|' +
  'frankfurt|berlin|munich|munchen|hamburg|cologne|koln|dusseldorf|stuttgart|madrid|barcelona|barcelone|valencia|' +
  'sevilla|bilbao|milan|milano|roma|turin|torino|amsterdam|rotterdam|brussels|bruxelles|brussel|zurich|geneva|' +
  'geneve|lausanne|vienna|wien|lisbon|lisbonne|lisboa|porto|dublin|warsaw|varsovie|warszawa|stockholm|copenhagen|' +
  'copenhague|oslo|helsinki|prague|praha|budapest|bucharest|bucarest|athens|athenes|europe|emea'
const NON_EUROPE_COUNTRIES =
  'china|chine|america|americas|amerique|usa|us|united states|canada|brazil|bresil|india|inde|japan|japon|' +
  'singapore|singapour|hong kong|dubai|uae|africa|afrique|maghreb|maroc|morocco|tunisie|tunisia|algerie|algeria|' +
  'senegal|egypt|egypte|asia|asie|pacific|pacifique|middle east|moyen orient|australia|australie|mexico|mexique|' +
  'pakistan|vietnam|philippines|indonesia|indonesie|turkey|turquie|israel|ukraine|russia|russie'
const FRANCE_ALIASES = new Set(['france', 'fr', 'fra', 'republique francaise', 'metropolitan france'])

const wordsRegex = (list: string) => new RegExp(`(?:^| )(?:${list})(?: |$)`)
const EUROPE_RE = wordsRegex(EUROPE_COUNTRIES)
const NON_EUROPE_RE = wordsRegex(NON_EUROPE_COUNTRIES)

export type GeoContactPlace = {
  country?: string | null
  city?: string | null
  location?: string | null
  /** Intitulé de poste : peut dire la zone (« VP Nordics »). */
  title?: string | null
  /** Employeur : peut être une filiale étrangère. */
  organization?: string | null
}

/**
 * Cette personne est-elle HORS du périmètre géographique choisi au lancement ?
 *
 * Avant ce point, `geo_perimeter` ne filtrait que le « chemin recommandé » côté IA :
 * les contacts collectés restaient tous au dossier, et une relance en « France »
 * laissait des profils d'Espagne ou d'Inde (#3742, #3744). Un pays CONNU et étranger
 * écarte ; un lieu absent ne prouve rien et garde (même règle que
 * `scope_filter.matches_geo` : écarter faute d'information ferait disparaître des
 * contacts français dont la fiche ne dit pas le pays). `france` et `europe` sont
 * tranchés sur le PAYS ; `city` (#3820, granularité SITE) sur la ville/le lieu
 * libre, via `isOutsideCityPerimeter` ci-dessous — `region` et `country` n'ont
 * toujours pas de nomenclature commune avec le texte libre des fiches : ils ne
 * restreignent rien (non mesuré, jamais deviné).
 */
export function isOutsideGeoPerimeter(
  place: GeoContactPlace,
  selection: AnalysisScopeSelection | undefined | null,
): boolean {
  const perimeter = selection?.geo_perimeter
  if (perimeter === 'city') return isOutsideCityPerimeter(place, selection?.geo_areas)
  if (perimeter !== 'france' && perimeter !== 'europe') return false

  const country = normalizeScopeLabel(place.country ?? '')
  const free = normalizeScopeLabel([place.city, place.location].filter(Boolean).join(' '))

  if (country) {
    if (FRANCE_ALIASES.has(country)) return false
    if (perimeter === 'europe' && EUROPE_RE.test(country) && !NON_EUROPE_RE.test(country)) return false
    // Pays renseigné mais non reconnu : on ne devine pas, on garde.
    return NON_EUROPE_RE.test(country) || EUROPE_RE.test(country)
  }
  if (free && (NON_EUROPE_RE.test(free) || (perimeter === 'france' && EUROPE_RE.test(free)))) return true
  return isOutsideByLabel(place, perimeter)
}

/**
 * #3742 / #3744 — la ZONE dite par le TITRE ou l'employeur (« VP Nordics »,
 * « CDO CEE », « CFO India », filiale Alcampo). Mesuré en prod le 10/10 : Schneider
 * cadré France gardait 3074 contacts dont Pacific, Nordics, CEE, parce que le
 * filtre ne lisait que le pays/la ville de la fiche, quasi toujours vide. Un
 * contact sans AUCUN lieu reste ; un titre qui nomme la France (« Head of France
 * & Nordics ») reste ; « Europe »/« EMEA » couvrent la France, on les garde.
 */
const TITLE_NON_EUROPE_EXTRA =
  'apac|apj|latam|mena|anz|cairo|caire|oceania|oceanie|south america|north america|gcc|asean'
const TITLE_EUROPE_EXTRA = 'nordics?|baltics?|bene|benelux|cee|dach|iberia|iberie|scandinavia|scandinavie'
const TITLE_EUROPE_COUNTRIES = EUROPE_COUNTRIES.replace('|europe|emea', '')
const TITLE_NON_EUROPE_RE = wordsRegex(`${NON_EUROPE_COUNTRIES.replace('|us|', '|')}|${TITLE_NON_EUROPE_EXTRA}`)
const TITLE_EUROPE_RE = wordsRegex(`${TITLE_EUROPE_COUNTRIES}|${TITLE_EUROPE_EXTRA}`)
/** Employeurs connus comme filiales ÉTRANGÈRES d'un groupe français. */
const FOREIGN_SUBSIDIARY_RE = wordsRegex('alcampo')
const FRANCE_WORD_RE = wordsRegex('france|francais|french')

function isOutsideByLabel(place: GeoContactPlace, perimeter: 'france' | 'europe'): boolean {
  const title = normalizeScopeLabel(place.title ?? '')
  const org = normalizeScopeLabel(place.organization ?? '')
  const text = `${title} ${org}`.trim()
  if (!text || FRANCE_WORD_RE.test(text)) return false
  if (TITLE_NON_EUROPE_RE.test(text)) return true
  if (perimeter !== 'france') return false
  return TITLE_EUROPE_RE.test(text) || FOREIGN_SUBSIDIARY_RE.test(org)
}

/**
 * #3820 — granularité SITE : `geo_areas` porte le(s) nom(s) de ville saisis
 * (même champ générique que `region`/`country`). Aucune ville saisie ⇒ rien à
 * comparer, donc rien ne restreint (même garde que `world`/`international`
 * côté ia). Un lieu renseigné qui ne nomme PAS la ville visée est hors site —
 * même lecture que `scope_filter.matches_geo` côté ia
 * (`apps/ia/app/services/scope_filter.py`) : un siège hors zone n'exclut qu'un
 * INDIVIDU dont le libellé dit explicitement un autre lieu, jamais un groupe.
 */
function isOutsideCityPerimeter(place: GeoContactPlace, geoAreas: string[] | undefined): boolean {
  const cities = (geoAreas ?? []).map(normalizeScopeLabel).filter(Boolean)
  if (!cities.length) return false
  const free = normalizeScopeLabel([place.city, place.location].filter(Boolean).join(' '))
  // Sans lieu : n'exclut que ce que le titre/l'employeur dit explicitement HORS France.
  if (!free) return isOutsideByLabel(place, 'france')
  return !cities.some(city => free.includes(city))
}

/**
 * #3742 — le cadrage EFFECTIF d'un run. La puce « France » du sélecteur de
 * périmètre (`scopeMode`) et le champ géographique du cadrage (`geo_perimeter`)
 * disent la même chose au commercial ; seul le second filtrait les personnes.
 * Une relance « France » choisie par la puce gardait donc l'Espagne et l'Inde.
 * Un `geo_perimeter` saisi gagne toujours (c'est le geste le plus précis) ;
 * sans lui, la puce `france` le pose. Les autres modes ne disent rien du pays.
 */
export function effectiveScopeSelection(
  scopeMode: string | null | undefined,
  selection: AnalysisScopeSelection | undefined,
): AnalysisScopeSelection | undefined {
  if (scopeMode !== 'france' || selection?.geo_perimeter) return selection
  return { ...(selection ?? {}), geo_perimeter: 'france' }
}
