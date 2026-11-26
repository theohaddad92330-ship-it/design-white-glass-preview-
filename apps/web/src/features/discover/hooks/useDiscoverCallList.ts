import { useMemo } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import {
  DISCOVER_CALL_LIST_MAX_COMPANIES,
  type DiscoverCallListCompany,
  type DiscoverCallListRequest,
  type DiscoverCallListResponse,
} from '@bellum/contracts'
import { discoverApi } from '@/features/discover/api/discover-api'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

/** La clé de cache — exportée pour que le geste « Trouver 10 personnes » la
 *  rafraîchisse au retour de la recherche de contacts. */
export const DISCOVER_CALL_LIST_QUERY_KEY = ['discover', 'call-list'] as const

/** Les entreprises d'une recherche → le corps de `POST /contacts/call-list`
 *  (une page de Découvrir au plus, dans l'ordre rendu par la recherche). */
function callListRequestFor(candidates: readonly DiscoverCandidate[]): DiscoverCallListRequest {
  const seen = new Set<string>()
  const companies: DiscoverCallListRequest['companies'] = []
  for (const candidate of candidates) {
    if (!candidate.siren || seen.has(candidate.siren)) continue
    seen.add(candidate.siren)
    companies.push({
      key: candidate.siren,
      siren: candidate.siren,
      accountId: candidate.accountId ?? null,
      name: candidate.name.slice(0, 300),
    })
    if (companies.length >= DISCOVER_CALL_LIST_MAX_COMPANIES) break
  }
  return { companies }
}

/**
 * #2545 / #3819 (démo Ludovic 08/10) — la SOURCE UNIQUE des personnes et des
 * signaux connus pour les entreprises de la recherche. Lue par l'onglet
 * Contacts, la liste d'appels ET la carte compte (signaux) — jamais trois
 * lectures qui se contredisent. Rend aussi la table `siren → entreprise`.
 */
export function useDiscoverCallList(
  candidates: readonly DiscoverCandidate[],
  enabled: boolean,
): {
  query: UseQueryResult<DiscoverCallListResponse>
  byKey: ReadonlyMap<string, DiscoverCallListCompany> | undefined
} {
  const request = useMemo(() => callListRequestFor(candidates), [candidates])
  const keys = useMemo(() => request.companies.map(c => c.key).join(','), [request])
  const query = useQuery<DiscoverCallListResponse>({
    queryKey: [...DISCOVER_CALL_LIST_QUERY_KEY, keys],
    enabled: enabled && request.companies.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: ({ signal }) => discoverApi.callList(request, signal),
  })
  const byKey = useMemo(
    // Une réponse sans `companies` (serveur antérieur, transport inattendu) se
    // lit « rien de connu », jamais un écran cassé.
    () =>
      Array.isArray(query.data?.companies)
        ? new Map(query.data.companies.map(company => [company.key, company]))
        : undefined,
    [query.data],
  )
  return { query, byKey }
}
