import {
  parseSignalDate,
  resolveSignalSourceLink,
  type SalesProfileForRelevance,
  type SignalNature,
  signalSortMs,
  signalStateKey,
  type SignalUserState,
} from '@bellum/contracts'
import {
  isHiringSignalItem,
  isRecruitmentItem,
  isOutOfTrade,
  itemNeedKind,
  type WatchlistItem,
} from '@/features/watchlist/model/watchlist'
import { parseSearch, scoreItem } from './signal-search'

/** Les quatre onglets de la bibliothèque (Théo A signaux.R3 / N2). */
export const LIBRARY_TABS = ['all', 'saved', 'discarded', 'trashed'] as const
type LibraryTab = (typeof LIBRARY_TABS)[number]

export type LibraryFilters = {
  tab: LibraryTab
  accountIds: ReadonlySet<string>
  natures: ReadonlySet<SignalNature>
  /** Date du fait : 7 / 30 / 90 jours ; `null` = sans borne. */
  sinceDays: 7 | 30 | 90 | null
  /** #4505 — « Rechercher une actualité, un compte… » : titre, compte et résumé. Vide = aucun filtre. */
  query?: string
  /** #4505 — « Plus récents » (défaut) ou « Plus anciens ». */
  sort?: LibrarySort
}

/** Lot 768 — « Pertinence » : le rang de la recherche ; proposé (et pris par défaut) seulement quand une requête est saisie. */
export const LIBRARY_SORTS = ['relevance', 'recent', 'oldest'] as const
type LibrarySort = (typeof LIBRARY_SORTS)[number]

type LibraryAccount = { accountId: string; companyName: string; count: number }
export type LibraryRow = {
  item: WatchlistItem
  state: SignalUserState | null
  nature: SignalNature | null
  /** #4403.1 — le signal sort du métier du profil : il se DIT (marque) et descend, il n'est jamais retiré. */
  outOfTrade: boolean
  key: string
}

type LibraryView = {
  rows: LibraryRow[]
  /** Combien de signaux passent les filtres, avant la pagination. */
  total: number
  remaining: number
  /** Les comptes qui ont au moins un signal dans l'onglet courant — les puces. */
  accounts: LibraryAccount[]
  counts: Record<LibraryTab, number>
}

const DAY_MS = 86_400_000

/** La clé de l'état d'un signal : le FAIT normalisé (contrat), jamais l'identifiant du flux. */
export function stateKeyOf(item: Pick<WatchlistItem, 'signalLabel'>): string {
  return signalStateKey(item.signalLabel)
}

/** La clé de la table d'états côté écran : `<compte>|<fait>`. */
export const stateMapKey = (accountId: string, signalKey: string): string => `${accountId}|${signalKey}`

/**
 * Théo A signaux.N7 — la nature d'un signal parmi les dix de Théo, par la classification UNIQUE du produit
 * (`itemNeedKind`, GA-26). Un type que rien ne classe n'a AUCUNE nature : on n'affiche pas ce qu'on n'a pas.
 */
export function natureOfSignal(item: Pick<WatchlistItem, 'signalType' | 'signalLabel'>): SignalNature | null {
  switch (itemNeedKind(item)) {
    case 'hiring':
      return 'hiring'
    case 'tender':
      return 'tender'
    case 'exec':
      return 'nomination'
    case 'funding':
    case 'mna':
      return 'investment'
    default:
      break
  }
  const type = item.signalType.trim().toLowerCase()
  if (type === 'press' || type === 'presse' || type === 'news') return 'press'
  if (type === 'award') return 'award'
  if (type === 'projet' || type === 'project' || type === 'tech') return 'project'
  return null
}

/**
 * Le site de l'éditeur de l'information, lu dans l'URL vérifiée de la source — jamais un nom deviné, jamais notre
 * fournisseur intermédiaire. Une URL absente ou non http(s) donne `null` : pas de lien, rien d'inventé.
 */
export function sourceSiteOf(url: string | null | undefined): string | null {
  const link = resolveSignalSourceLink({ url, source_kind: null })
  if (link.kind === 'none') return null
  try {
    return new URL(link.url).hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/** Lot 772 — la NATURE d'une source : ce qu'on va lire, jamais qui l'édite (décision Louis 31/10). */
export type SourceKind = 'job' | 'tender' | 'legal' | 'company' | 'press'

const hostOfWebsite = (website: string | null | undefined): string | null => {
  const raw = (website ?? '').trim()
  if (raw === '') return null
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/**
 * Lot 772 — « Offre d'emploi », « Marché public », « Annonce légale », « Site de l'entreprise », « Presse » : le libellé
 * générique de la source d'un signal. `null` sans URL vérifiable (pas de lien, rien à nommer). Les sources ne se
 * nomment jamais : l'adresse reste derrière le lien.
 */
export function sourceKindOf(item: WatchlistItem): SourceKind | null {
  const site = sourceSiteOf(item.sourceUrl)
  if (site === null) return null
  if (isHiringSignalItem(item)) return 'job'
  const type = fold(item.signalType ?? '')
  if (/tender|appel|marche|boamp/.test(type)) return 'tender'
  if (/legal|bodacc|annonce|juridique/.test(type)) return 'legal'
  const own = hostOfWebsite(item.website)
  if (own !== null && (site === own || site.endsWith(`.${own}`))) return 'company'
  return 'press'
}

/** Minuscules, sans accent ni espace superflu : « Réseau » se trouve en tapant « reseau ». */
export const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

function factMs(item: WatchlistItem): number | null {
  return signalSortMs(parseSignalDate(item.signalDate))
}

/** Le plus récent d'abord (ou le plus ancien, `direction = -1`) ; dans les deux sens, un fait sans date lisible passe APRÈS les datés (jamais une date de 1970 devinée). */
function byRecency(left: WatchlistItem, right: WatchlistItem, direction: 1 | -1 = 1): number {
  const a = factMs(left)
  const b = factMs(right)
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return direction * (b - a)
}

/**
 * La vue de la bibliothèque : l'état de chaque signal, l'onglet, les filtres (compte · nature · date du fait), le tri
 * « plus récents d'abord » et la pagination. Aucune recherche, aucun appel : tout vient des résultats déjà disponibles.
 */
export function buildSignalLibrary(
  items: WatchlistItem[],
  states: ReadonlyMap<string, SignalUserState>,
  filters: LibraryFilters,
  options: { now: number; visible: number; profile?: SalesProfileForRelevance },
): LibraryView {
  const all: LibraryRow[] = items.map(item => {
    const key = stateKeyOf(item)
    return {
      item,
      key,
      state: states.get(stateMapKey(item.accountId, key)) ?? null,
      nature: natureOfSignal(item),
      outOfTrade: isOutOfTrade(item, options.profile),
    }
  })

  const inTab = (row: LibraryRow, tab: LibraryTab): boolean =>
    tab === 'all' ? row.state !== 'discarded' && row.state !== 'trashed' : row.state === tab
  const counts: Record<LibraryTab, number> = { all: 0, saved: 0, discarded: 0, trashed: 0 }
  for (const row of all) for (const tab of LIBRARY_TABS) if (inTab(row, tab)) counts[tab] += 1

  const sinceMs = filters.sinceDays === null ? null : options.now - filters.sinceDays * DAY_MS
  const tabbed = all.filter(row => inTab(row, filters.tab))

  const accountsMap = new Map<string, LibraryAccount>()
  for (const row of tabbed) {
    const known = accountsMap.get(row.item.accountId)
    if (known) known.count += 1
    else
      accountsMap.set(row.item.accountId, {
        accountId: row.item.accountId,
        companyName: row.item.companyName,
        count: 1,
      })
  }

  // Lot 768 — la recherche vit dans `signal-search.ts` (la même que l'Historique, GA-26) ; elle rend un score.
  const search = parseSearch(filters.query ?? '')
  const scores = new Map<string, number>()
  const matching = search
    ? tabbed.filter(row => {
        const hit = scoreItem(search, row.item, options.now)
        if (hit) scores.set(row.item.id, hit.score)
        return hit !== null
      })
    : tabbed
  // Pas de requête ⇒ pas de pertinence : « Pertinence » retombe sur « Plus récents ».
  const sort = filters.sort === 'relevance' && !search ? 'recent' : (filters.sort ?? (search ? 'relevance' : 'recent'))
  const direction: 1 | -1 = sort === 'oldest' ? -1 : 1
  const defaultOrder = filters.sort == null && !search
  const byRelevance = (left: LibraryRow, right: LibraryRow): number =>
    (scores.get(right.item.id) ?? 0) - (scores.get(left.item.id) ?? 0)
  const kept = matching
    .filter(row => filters.accountIds.size === 0 || filters.accountIds.has(row.item.accountId))
    .filter(row => filters.natures.size === 0 || (row.nature !== null && filters.natures.has(row.nature)))
    .filter(row => {
      if (sinceMs === null) return true
      const ms = factMs(row.item)
      return ms !== null && ms >= sinceMs
    })
    // #4403.1 — « hors métier gardé plus bas » (19/10) : dans les DEUX sens de date, le hors métier suit le métier.
    .sort(
      (left, right) =>
        Number(left.outOfTrade) - Number(right.outOfTrade) ||
        // #5191 — ordre PAR DÉFAUT (aucun tri choisi, aucune recherche) : les recrutements en tête, rien n'est masqué.
        (defaultOrder ? Number(!isRecruitmentItem(left.item)) - Number(!isRecruitmentItem(right.item)) : 0) ||
        (sort === 'relevance' ? byRelevance(left, right) : 0) ||
        byRecency(left.item, right.item, direction),
    )

  return {
    rows: kept.slice(0, options.visible),
    total: kept.length,
    remaining: Math.max(0, kept.length - options.visible),
    accounts: [...accountsMap.values()],
    counts,
  }
}
