import { useQuery } from '@tanstack/react-query'
import { emptyNeedFilters, needFiltersToQuery } from '@bellum/contracts'
import { openNeedsApi } from '@/features/projects/open-needs/api'
import { GLOBAL_SEARCH_MIN_QUERY_LENGTH, GLOBAL_SEARCH_RESULT_LIMIT } from './constants'

/**
 * #2207.70 — recherche : besoin.
 *
 * `openNeedsApi.list` — le même endpoint que la liste transverse des besoins
 * (`GET /projects/needs?q=`) — construit via `needFiltersToQuery` (le SEUL
 * traducteur filtres → requête, `@bellum/contracts`) plutôt qu'un objet
 * composé à la main : c'est ce qui garantit que la recherche globale ne peut
 * pas envoyer un critère que le serveur refuserait.
 */
export function useNeedSearchResults(query: string) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: ['global-search', 'needs', trimmed],
    queryFn: () =>
      openNeedsApi.list(
        needFiltersToQuery({ ...emptyNeedFilters(), q: trimmed }, { offset: 0, limit: GLOBAL_SEARCH_RESULT_LIMIT }),
      ),
    enabled: trimmed.length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH,
    staleTime: 15_000,
  })
}
