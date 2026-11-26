import { useQuery } from '@tanstack/react-query'
import { accountsApi } from '@/features/accounts/api'
import { GLOBAL_SEARCH_MIN_QUERY_LENGTH, GLOBAL_SEARCH_RESULT_LIMIT } from './constants'

/**
 * #2207.68 — recherche : compte.
 *
 * Réutilise `accountsApi.list({ q })` — l'endpoint EXISTE déjà (`GET
 * /accounts?q=`, `accountListQuerySchema`), servant la liste `/accounts`
 * elle-même. Aucune route neuve : la recherche globale n'ajoute qu'un
 * APPELANT de plus au même endpoint, avec la même portée (RLS, espace actif)
 * que l'écran des comptes.
 */
export function useAccountSearchResults(query: string) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: ['global-search', 'accounts', trimmed],
    queryFn: () => accountsApi.list({ q: trimmed, limit: GLOBAL_SEARCH_RESULT_LIMIT, offset: 0 }),
    enabled: trimmed.length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH,
    staleTime: 15_000,
  })
}
