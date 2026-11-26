import { isIntermediaryActor, type AccessBarrierClass } from '@bellum/contracts'
import { headquartersCity } from '@/features/accounts/view/account-detail/tabs/synthesis/accountSynthesis'

/**
 * #4498 (PR 12C, maquette V22) — LES CRITÈRES DE LA MODALE « FILTRER MON PORTEFEUILLE ».
 *
 * Chaque critère est une LISTE de cases cochées (la liste vide = « Tous », jamais écrite dans l'URL). Ils
 * RANGENT les comptes de l'espace, ils ne lancent aucune recherche de marché. Onze critères écrivent un axe que
 * `GET /accounts` filtre (secteur, relation, état secondaire, étiquette, décision, type d'entité, fraîcheur,
 * intérêt, statut d'analyse, historique documenté, références autorisées) ; deux se jugent sur les lignes
 * CHARGÉES, comme l'accessibilité depuis le 30/08 (type de compte, accessibilité).
 *
 * Un critère dont la donnée n'existe pas n'est PAS ici (on n'affiche pas ce qu'on n'a pas) : le responsable
 * nommé vit dans la barre, « Toute l'équipe » (un réglage à un seul endroit — GA-26).
 */

/** La relation commerciale de Théo (À ouvrir · En ouverture · Client). `to_open` = `headline=withoutNextAction`, les autres = l'axe `lifecycle`. */
export const PORTFOLIO_RELATIONS = ['to_open', 'opening', 'customer'] as const
/** L'état secondaire (Hors priorité · En veille) — le MÊME axe `lifecycle`, jamais un cinquième statut. */
export const PORTFOLIO_SECONDARY_STATES = ['archived', 'dormant'] as const
export const PORTFOLIO_ACCOUNT_TYPES = ['final', 'intermediary'] as const
export const PORTFOLIO_SCORE_BUCKETS = ['high', 'medium', 'low'] as const
/** #4498.c — « Historique documenté » : le compte porte (ou non) une preuve enregistrée. */
export const PORTFOLIO_DOCUMENTED_HISTORY = ['with', 'without'] as const
/** #4498.c — « Références autorisées de mon ESN uniquement » : une case, une valeur. */
export const PORTFOLIO_AUTHORIZED_REFERENCES = ['only'] as const

export type PortfolioAccountType = (typeof PORTFOLIO_ACCOUNT_TYPES)[number]

/** `headline` que « À ouvrir » écrit : les comptes suivis sans prochaine action. */
export const TO_OPEN_HEADLINE = 'withoutNextAction'

/**
 * #4498.a — CHAQUE CRITÈRE SE COCHE À PLUSIEURS : une liste, et la liste vide EST « Tous » (rien n'est écrit
 * dans l'URL). Dans l'URL, une valeur seule reste un scalaire (`?sector=Banque`, les liens d'avant) et seules
 * deux valeurs ou plus deviennent une liste : tout lecteur de l'URL qui attend un scalaire continue de marcher.
 */
export type PortfolioFilterValues = {
  sector: string[]
  relation: string[]
  secondary: string[]
  tag: string[]
  gate: string[]
  entityKind: string[]
  freshness: string[]
  accountType: string[]
  /** #4989.1 — ville ou département du siège (et des implantations connues), jugé sur les lignes chargées. */
  zone: string[]
  score: string[]
  accessClass: string[]
  status: string[]
  documentedHistory: string[]
  authorizedReferences: string[]
}

export const EMPTY_PORTFOLIO_FILTERS: PortfolioFilterValues = {
  sector: [],
  relation: [],
  secondary: [],
  tag: [],
  gate: [],
  entityKind: [],
  freshness: [],
  accountType: [],
  zone: [],
  score: [],
  accessClass: [],
  status: [],
  documentedHistory: [],
  authorizedReferences: [],
}

/** Les rangements hérités (`inbox`/`watching`/`opportunity`) qu'aucune liste de la modale ne nomme. */
const LEGACY_LIFECYCLES = new Set(['inbox', 'watching', 'opportunity'])

/** Une valeur d'URL (scalaire, liste ou absente), lue en liste sans « Tous » ni doublon. */
export function readFilterList(raw: unknown): string[] {
  const items = Array.isArray(raw) ? raw : [raw]
  const kept = items.filter((item): item is string => typeof item === 'string' && item.trim() !== '' && item !== 'all')
  return [...new Set(kept)]
}

/** Une liste, écrite comme l'URL la porte : rien, un scalaire, ou une liste. */
export function writeFilterList(values: readonly string[]): string | string[] | undefined {
  if (values.length === 0) return undefined
  return values.length === 1 ? values[0] : [...values]
}

function only<T extends string>(allowed: readonly T[], values: string[]): T[] {
  return values.filter((value): value is T => (allowed as readonly string[]).includes(value))
}

/** Les valeurs que l'URL porte, lues pour la modale. `lifecycle` se répartit sur relation ET état secondaire. */
export function portfolioFiltersFromSearch(
  search: Record<string, unknown>,
): Omit<PortfolioFilterValues, 'accountType' | 'accessClass' | 'zone'> {
  const lifecycle = readFilterList(search['lifecycle'])
  const toOpen = search['headline'] === TO_OPEN_HEADLINE
  return {
    sector: readFilterList(search['sector']),
    relation: [...(toOpen ? ['to_open'] : []), ...only(PORTFOLIO_RELATIONS, lifecycle)],
    secondary: only(PORTFOLIO_SECONDARY_STATES, lifecycle),
    tag: readFilterList(search['tag']),
    gate: readFilterList(search['gate']),
    entityKind: readFilterList(search['entityKind']),
    freshness: readFilterList(search['freshness']).filter(value => value === 'stale'),
    score: only(PORTFOLIO_SCORE_BUCKETS, readFilterList(search['score'])),
    status: readFilterList(search['status']),
    documentedHistory: only(PORTFOLIO_DOCUMENTED_HISTORY, readFilterList(search['documentedHistory'])),
    authorizedReferences: only(PORTFOLIO_AUTHORIZED_REFERENCES, readFilterList(search['authorizedReferences'])),
  }
}

/**
 * L'URL après « Appliquer les filtres » : chaque axe serveur posé, ou retiré quand sa liste est vide.
 *
 * ⚠️ Un rangement hérité (`?lifecycle=opportunity`, posé par l'encart « Opportunités ») n'a pas de liste ici :
 * appliquer la modale sans toucher la relation le GARDE — seul « Réinitialiser » (`reset`) le relâche. Sans
 * cela, appliquer un secteur effacerait en silence une restriction que personne n'a retirée.
 *
 * « À ouvrir » possède le `headline` `withoutNextAction` : le choisir le pose, le décocher le retire. Les
 * autres `headline` (À reprendre, Relations actives — posés par la bande de tête) ne sont jamais touchés.
 */
export function searchForPortfolioFilters(
  prev: Record<string, unknown>,
  values: PortfolioFilterValues,
  { reset = false }: { reset?: boolean } = {},
): Record<string, unknown> {
  const chosenLifecycle = [...values.relation.filter(value => value !== 'to_open'), ...values.secondary]
  const keepLegacy = !reset && chosenLifecycle.length === 0 && LEGACY_LIFECYCLES.has(String(prev['lifecycle']))
  const toOpen = values.relation.includes('to_open')
  const prevHeadline = prev['headline']
  const headline = toOpen ? TO_OPEN_HEADLINE : prevHeadline === TO_OPEN_HEADLINE ? undefined : prevHeadline
  return {
    ...prev,
    sector: writeFilterList(values.sector),
    tag: writeFilterList(values.tag),
    gate: writeFilterList(values.gate),
    entityKind: writeFilterList(values.entityKind),
    freshness: writeFilterList(values.freshness),
    score: writeFilterList(values.score),
    status: writeFilterList(values.status),
    documentedHistory: writeFilterList(values.documentedHistory),
    authorizedReferences: writeFilterList(values.authorizedReferences),
    lifecycle: keepLegacy ? prev['lifecycle'] : writeFilterList(chosenLifecycle),
    headline,
    page: undefined,
  }
}

/**
 * Combien de valeurs la modale porte — le nombre du bouton « Filtres ».
 * #4941.2 — il égale les puces : UNE par case cochée (« error » + « canceled » = 2 puces = 2). Revient sur #4498,
 * qui comptait un critère une fois et laissait « Filtres (1) » au-dessus de deux puces.
 */
export function countPortfolioFilters(values: PortfolioFilterValues): number {
  return Object.values(values).reduce((total, list) => total + list.length, 0)
}

/**
 * Le type de compte d'une ligne : « Intermédiaire » (cabinet de recrutement, plateforme de mise en relation)
 * par le MÊME jugement que le badge de ligne (`is_intermediary`, sinon `isIntermediaryActor` sur le NAF et le
 * nom — GA-26), « Client final » sinon.
 */
export function accountTypeOf(row: {
  company_name: string
  naf_code?: string | null
  is_intermediary?: boolean | null
}): PortfolioAccountType {
  if (row.is_intermediary === true) return 'intermediary'
  return isIntermediaryActor({ name: row.company_name, naf: row.naf_code ?? null }) ? 'intermediary' : 'final'
}

/**
 * #4989 — LA ZONE d'un compte : ville et département lus dans le TEXTE du siège (`headquarters`) et, quand la
 * ligne les porte, dans ses implantations (`sites`, #5008 — #4989.2). Sans implantation connue, le siège seul
 * juge, et la modale le DIT. Un lieu absent ne prouve rien : il sort dès qu'une zone est choisie.
 */
type ZoneSource = { headquarters?: string | null; sites?: readonly string[] | null }

const normalizeZone = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

function placesOf(row: ZoneSource): string[] {
  return [row.headquarters, ...(row.sites ?? [])].filter((place): place is string => !!place && place.trim() !== '')
}

function departmentOf(place: string): string | null {
  const match = /\b(\d{5})\b/.exec(place)
  return match?.[1] ? match[1].slice(0, 2) : null
}

export function portfolioZoneOptions(rows: readonly ZoneSource[]): { value: string; kind: 'city' | 'department' }[] {
  const cities = new Map<string, string>()
  const departments = new Set<string>()
  for (const row of rows) {
    for (const place of placesOf(row)) {
      const city = headquartersCity(place)
      if (city && !cities.has(normalizeZone(city))) cities.set(normalizeZone(city), city)
      const department = departmentOf(place)
      if (department) departments.add(department)
    }
  }
  return [
    ...[...departments].sort().map(value => ({ value, kind: 'department' as const })),
    ...[...cities.values()].sort((a, b) => a.localeCompare(b)).map(value => ({ value, kind: 'city' as const })),
  ]
}

export function accountInZone(row: ZoneSource, zones: readonly string[]): boolean {
  if (zones.length === 0) return true
  const wanted = zones.map(normalizeZone)
  return placesOf(row).some(place => {
    const city = headquartersCity(place)
    const department = departmentOf(place)
    return (
      (city !== null && wanted.includes(normalizeZone(city))) || (department !== null && wanted.includes(department))
    )
  })
}
