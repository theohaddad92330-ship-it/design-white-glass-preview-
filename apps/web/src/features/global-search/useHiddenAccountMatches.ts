import { useQuery } from '@tanstack/react-query'
import { accountsApi } from '@/features/accounts/api'
import { GLOBAL_SEARCH_MIN_QUERY_LENGTH } from './constants'

type HiddenAccountMatches = { kind: 'archived' | 'failed'; count: number }

/**
 * #4621.2 — ce que la liste des comptes ÉCARTE, la recherche globale le DIT.
 *
 * `GET /accounts?q=` masque les comptes archivés (#4053) et les coquilles d'échec vides : la recherche globale,
 * qui appelle le même endpoint, héritait de ce silence (« 5 contacts Engie, aucun compte »). Même lecture que
 * `NotInPortfolioEmptyState` : seul le total (`limit: 1`), `archived` d'abord, puis `error | canceled`.
 *
 * Lue seulement quand `enabled` — c'est-à-dire quand la recherche principale a répondu SANS compte actif. Une
 * lecture ratée ou en cours rend `null` : jamais un « 0 archivé » affirmé sans mesure.
 */
export function useHiddenAccountMatches(query: string, enabled: boolean): HiddenAccountMatches | null {
  const trimmed = query.trim()
  const on = enabled && trimmed.length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH
  const archived = useQuery({
    queryKey: ['global-search', 'accounts-archived', trimmed],
    queryFn: () => accountsApi.list({ q: trimmed, status: 'archived', limit: 1, offset: 0 }),
    enabled: on,
    staleTime: 15_000,
  })
  const failed = useQuery({
    queryKey: ['global-search', 'accounts-failed', trimmed],
    queryFn: () => accountsApi.list({ q: trimmed, status: ['error', 'canceled'], limit: 1, offset: 0 }),
    enabled: on,
    staleTime: 15_000,
  })
  const archivedCount = archived.data?.pagination.totalItems
  if (archivedCount !== undefined && archivedCount > 0) return { kind: 'archived', count: archivedCount }
  const failedCount = failed.data?.pagination.totalItems
  if (failedCount !== undefined && failedCount > 0) return { kind: 'failed', count: failedCount }
  return null
}
