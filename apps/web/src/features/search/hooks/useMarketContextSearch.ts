import type { MarketContextSearchRead } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { companiesApi, companyKeys } from '@/features/search/api'
import type { MarketContextQuery } from '@/features/discover/lib/market-context'

/** Même prudence que `useMarketPreview` : le corpus ne bouge qu'à l'ingestion. */
const STALE_MS = 5 * 60_000

/**
 * #1626/#1627 — la recherche par contexte marché observé. ZÉRO crédit : une
 * lecture de `MarketMemoryService.searchByFilters`, relayée telle quelle par
 * `GET /companies/market-context-search`.
 *
 * `query: null` désactive la lecture — l'appelant (Découvrir, l'onboarding) le
 * calcule via `buildMarketContextQuery` / `deriveMarketAwarenessQuery`, et
 * aucune requête ne part tant qu'aucun discriminant n'est posé.
 */
export function useMarketContextSearch(query: MarketContextQuery | null) {
  return useQuery<MarketContextSearchRead>({
    queryKey: companyKeys.marketContextSearch(query ?? {}),
    queryFn: () => companiesApi.marketContextSearch(query as MarketContextQuery),
    enabled: query !== null,
    staleTime: STALE_MS,
  })
}
