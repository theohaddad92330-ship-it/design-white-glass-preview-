import { emptyUnifiedFilters, type UnifiedFilters } from './discover-filters'
import { meaningfulFilters } from './discover-saved-searches'
import { discoverStorageKey, readJson, writeJson } from './discover-storage'

/* ------------------------------------------------------------------ */
/*  #4313.1 — l'HISTORIQUE des recherches lancées (décision Louis       */
/*  19/10 ; 30 jours, brief 20/10) : 20 au plus, relançables d'un clic. Local à        */
/*  l'utilisateur (préfixe Découvrir : la purge RGPD le balaie) — ce    */
/*  n'est PAS une recherche enregistrée (celles-ci vivent côté serveur, */
/*  avec alertes) : l'historique s'efface seul.                        */
/* ------------------------------------------------------------------ */

const NAMESPACE = 'search-history'
export const HISTORY_WINDOW_DAYS = 30
export const HISTORY_MAX_ENTRIES = 20
const DAY_MS = 86_400_000

export interface SearchHistoryEntry {
  id: string
  at: number
  filters: UnifiedFilters
  /** Comptes du résultat à l'arrivée ; absent = non mesuré, jamais 0. */
  count?: number
}

function isHistory(value: unknown): value is SearchHistoryEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      entry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as SearchHistoryEntry).id === 'string' &&
        typeof (entry as SearchHistoryEntry).at === 'number' &&
        typeof (entry as SearchHistoryEntry).filters === 'object' &&
        (entry as SearchHistoryEntry).filters !== null,
    )
  )
}

export function pruneHistory(entries: readonly SearchHistoryEntry[], now: number): SearchHistoryEntry[] {
  return entries
    .filter(entry => now - entry.at <= HISTORY_WINDOW_DAYS * DAY_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, HISTORY_MAX_ENTRIES)
}

/** Ajoute (ou remonte) une recherche ; un rail sans critère n'est pas une recherche. */
export function recordSearch(
  entries: readonly SearchHistoryEntry[],
  filters: UnifiedFilters,
  now: number,
): SearchHistoryEntry[] {
  const key = JSON.stringify(meaningfulFilters(filters))
  if (key === '{}') return pruneHistory(entries, now)
  const others = entries.filter(entry => JSON.stringify(meaningfulFilters(entry.filters)) !== key)
  return pruneHistory([{ id: `${now}-${others.length}`, at: now, filters }, ...others], now)
}

export function readSearchHistory(userId: string | undefined, now: number): SearchHistoryEntry[] {
  if (!userId) return []
  const stored = readJson(discoverStorageKey(NAMESPACE, userId), isHistory) ?? []
  // Les filtres relus sont recomplétés par le rail vide : un champ ajouté depuis ne casse pas la relance.
  return pruneHistory(
    stored.map(entry => ({ ...entry, filters: { ...emptyUnifiedFilters(), ...entry.filters } })),
    now,
  )
}

export function writeSearchHistory(userId: string | undefined, entries: readonly SearchHistoryEntry[]): void {
  if (userId) writeJson(discoverStorageKey(NAMESPACE, userId), entries)
}
