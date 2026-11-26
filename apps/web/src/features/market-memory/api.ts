import type {
  MarketResolutionDecisionRecord,
  MarketResolutionDecisionRequest,
  MarketPortfolioRead,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/**
 * #1633 / #1635 / #1634 — LA COUVERTURE MÉMOIRE MARCHÉ DU PORTEFEUILLE.
 *
 * UNE route, UNE clé de cache, TROIS écrans. C'est la moitié web de #1621 :
 * l'API garantit un seul calcul (GA-258), et ceci garantit que les trois écrans
 * lisent bien ce calcul-là. Deux clés de cache différentes rendraient deux
 * lectures à deux instants, donc deux nombres, sur des écrans qu'un même
 * utilisateur ouvre à trois minutes d'intervalle.
 *
 * ⚠️ La clé s'IMPORTE, elle ne se recopie pas — une clé retapée à la main est
 * une clé qui ne s'invalide pas avec les autres.
 */
export const marketMemoryApi = {
  portfolio(): Promise<MarketPortfolioRead> {
    return apiFetch<MarketPortfolioRead>({ path: '/accounts/market-memory-portfolio' })
  },
}

export const marketMemoryKeys = {
  portfolio: () => ['market-memory', 'portfolio'] as const,
}

/**
 * `staleTime` à cinq minutes : l'agrégat parcourt tout le portefeuille et ne
 * bouge qu'à l'ingestion d'un corpus ou à la création d'un compte. Le
 * rafraîchir à chaque montée d'écran ferait payer trois lectures complètes pour
 * naviguer entre trois onglets.
 */
export function useMarketMemoryPortfolio() {
  return useQuery({
    queryKey: marketMemoryKeys.portfolio(),
    queryFn: marketMemoryApi.portfolio,
    staleTime: 5 * 60_000,
  })
}

/**
 * #1617.4 — ENREGISTRE LA DÉCISION D'UN HUMAIN sur un rapprochement.
 *
 * ⚠️ `invalidateQueries` sur la clé du portefeuille, et ce n'est PAS un
 * confort : le `staleTime` est de cinq minutes, si bien que sans invalidation
 * le compte départagé resterait dans la file jusqu'à ce que quelqu'un recharge
 * la page. Le geste n'aurait servi à rien À L'ÉCRAN alors qu'il a bien écrit —
 * l'utilisateur recliquerait, et cette fois sur une décision déjà prise.
 *
 * Une SEULE clé à invalider, parce qu'il n'y a qu'une lecture : « une route,
 * une clé de cache, trois écrans » (voir l'en-tête de `marketMemoryApi`). Les
 * trois se remettent donc d'accord ensemble.
 */
export function useRecordMarketResolution() {
  const queryClient = useQueryClient()
  return useMutation<MarketResolutionDecisionRecord, Error, { accountId: string } & MarketResolutionDecisionRequest>({
    mutationFn: ({ accountId, ...decision }) =>
      apiFetch<MarketResolutionDecisionRecord, MarketResolutionDecisionRequest>({
        path: `/accounts/${accountId}/market-resolution`,
        method: 'PUT',
        body: decision,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: marketMemoryKeys.portfolio() })
    },
  })
}
