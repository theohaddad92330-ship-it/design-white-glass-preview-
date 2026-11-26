import type { SalesProfileForRelevance } from '@bellum/contracts'
import {
  isOutOfTrade,
  itemNeedKind,
  signalDiscardReason,
  WATCHLIST_TYPE_FACETS,
  type WatchlistItem,
  type WatchlistTypeFacet,
} from './watchlist'

/* ------------------------------------------------------------------ */
/*  La bibliothèque de signaux (Théo signaux) — le modèle pur.          */
/*                                                                     */
/*  Une liste PLATE de signaux, filtrable par compte, nature et date du  */
/*  fait. Quatre onglets : Tous · Enregistrés · Écartés · Corbeille.     */
/*  « Écartés » est le bruit que la veille reconnaît elle-même          */
/*  (`signalDiscardReason`) ; « Enregistrés » et « Corbeille » sont les  */
/*  marques de la personne. Rien n'est supprimé : la corbeille se       */
/*  restaure (on archive, on ne supprime pas).                          */
/* ------------------------------------------------------------------ */

export const LIBRARY_TABS = ['all', 'saved', 'dismissed', 'trash'] as const
export type LibraryTab = (typeof LIBRARY_TABS)[number]

export const LIBRARY_DATE_WINDOWS = [7, 30, 90] as const
export type LibraryDateWindow = (typeof LIBRARY_DATE_WINDOWS)[number]

/** #4403.1 — `trade` (le défaut) : les signaux du métier de l'ESN d'abord, puis les plus récents ; le hors métier suit,
 *  jamais retiré (le rôle change l'ORDRE, jamais le contenu). `recent` / `oldest` restent l'ordre pur des dates. */
export type LibrarySort = 'trade' | 'recent' | 'oldest'

export const LIBRARY_NATURES = WATCHLIST_TYPE_FACETS
export type LibraryNature = WatchlistTypeFacet

/** Combien de cartes s'ajoutent à chaque « Afficher les suivants ». */
export const LIBRARY_PAGE_SIZE = 12
export const LIBRARY_STEP = 5

export interface LibraryMarks {
  saved: ReadonlySet<string>
  trashed: ReadonlySet<string>
}

export interface LibraryState {
  tab: LibraryTab
  /** Multi-sélection : vide = tous les comptes. */
  accountIds: ReadonlySet<string>
  query: string
  natures: ReadonlySet<LibraryNature>
  /** `null` = toutes les dates. */
  days: LibraryDateWindow | null
  sort: LibrarySort
}

export const EMPTY_LIBRARY_STATE: LibraryState = {
  tab: 'all',
  accountIds: new Set(),
  query: '',
  natures: new Set(),
  days: null,
  sort: 'trade',
}

const DAY_MS = 86_400_000

function time(item: WatchlistItem): number {
  const parsed = Date.parse(item.signalDate)
  return Number.isNaN(parsed) ? 0 : parsed
}

/** La nature d'un signal : le besoin qu'il porte, sinon « Autres ». Jamais devinée ailleurs (GA-26). */
export function natureOf(item: Pick<WatchlistItem, 'signalType' | 'signalLabel'>): LibraryNature {
  return itemNeedKind(item) ?? 'other'
}

function matchesQuery(item: WatchlistItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [item.companyName, item.displayLabel ?? item.signalLabel, item.signalSource]
    .filter(Boolean)
    .some(text => text.toLowerCase().includes(needle))
}

function inTab(
  item: WatchlistItem,
  tab: LibraryTab,
  marks: LibraryMarks,
  profile: SalesProfileForRelevance | undefined,
) {
  const trashed = marks.trashed.has(item.id)
  if (tab === 'trash') return trashed
  if (trashed) return false
  if (tab === 'saved') return marks.saved.has(item.id)
  if (tab === 'dismissed') return signalDiscardReason(item, profile) !== null
  return signalDiscardReason(item, profile) === null
}

interface LibraryView {
  /** Tous les signaux de l'onglet après filtres, triés. */
  items: WatchlistItem[]
  /** Le compte de chaque onglet, AVANT les filtres de recherche : ce que contient l'onglet. */
  tabCounts: Record<LibraryTab, number>
  /** Les comptes qui portent au moins un signal, pour la puce « Tous les comptes ». */
  accounts: { id: string; name: string }[]
}

export function buildLibraryView(
  items: readonly WatchlistItem[],
  state: LibraryState,
  marks: LibraryMarks,
  profile: SalesProfileForRelevance | undefined,
  now: number,
): LibraryView {
  const tabCounts = Object.fromEntries(
    LIBRARY_TABS.map(tab => [tab, items.filter(item => inTab(item, tab, marks, profile)).length]),
  ) as Record<LibraryTab, number>
  const inScope = items.filter(item => inTab(item, state.tab, marks, profile))
  const accounts = [...new Map(inScope.map(item => [item.accountId, item.companyName])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const filtered = inScope.filter(item => {
    if (state.accountIds.size > 0 && !state.accountIds.has(item.accountId)) return false
    if (state.natures.size > 0 && !state.natures.has(natureOf(item))) return false
    if (state.days !== null && now - time(item) > state.days * DAY_MS) return false
    return matchesQuery(item, state.query)
  })
  const outOfTrade = (item: WatchlistItem) => (state.sort === 'trade' && isOutOfTrade(item, profile) ? 1 : 0)
  const sorted = [...filtered].sort((a, b) => {
    if (state.sort === 'oldest') return time(a) - time(b)
    return outOfTrade(a) - outOfTrade(b) || time(b) - time(a)
  })
  return { items: sorted, tabCounts, accounts }
}
