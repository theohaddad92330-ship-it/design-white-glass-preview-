import { useQuery } from '@tanstack/react-query'
import { consultantsApi } from '@/features/consultants/api'
import { GLOBAL_SEARCH_MIN_QUERY_LENGTH, GLOBAL_SEARCH_RESULT_LIMIT } from './constants'

/**
 * #2207.71 — recherche : consultant.
 *
 * `consultantsApi.search({ q })` — le même endpoint que le vivier
 * (`GET /talents?q=`), pas `consultantsApi.list()` (`GET /consultants`, la
 * liste ENTIÈRE non filtrée, sans `q`). C'est la même distinction que pour les
 * contacts (l'interne vs. l'externe) : ici deux internes, dont un seul sait
 * chercher.
 */
export function useConsultantSearchResults(query: string) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: ['global-search', 'consultants', trimmed],
    queryFn: () => consultantsApi.search({ q: trimmed, page: 1, limit: GLOBAL_SEARCH_RESULT_LIMIT }),
    enabled: trimmed.length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH,
    staleTime: 15_000,
  })
}
