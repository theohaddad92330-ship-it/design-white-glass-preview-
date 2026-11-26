import { useQuery } from '@tanstack/react-query'
import { contactsApi } from '@/features/contacts/api'
import { GLOBAL_SEARCH_MIN_QUERY_LENGTH, GLOBAL_SEARCH_RESULT_LIMIT } from './constants'

/**
 * #2207.69 — recherche : contact.
 *
 * `contactsApi.listPage({ q })` — le même endpoint interne que la liste
 * `/contacts` (`GET /contacts?q=`, `contactListQuerySchema`), pas
 * `searchByName` : ce second endpoint interroge Apollo (un fournisseur
 * EXTERNE), une capacité différente que la recherche globale ne touche pas.
 */
export function useContactSearchResults(query: string) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: ['global-search', 'contacts', trimmed],
    queryFn: () => contactsApi.listPage({ q: trimmed, limit: GLOBAL_SEARCH_RESULT_LIMIT, offset: 0 }),
    enabled: trimmed.length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH,
    staleTime: 15_000,
  })
}
