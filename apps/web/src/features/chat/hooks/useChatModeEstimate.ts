import { useQuery } from '@tanstack/react-query'
import { chatModeEstimateApi } from '@/features/chat/api/chatModeEstimateApi'

/**
 * #2448.8 / #2882.11 (épopée #2882) — coût et durée d'un tour, AVANT de le
 * lancer. `enabled` seulement pour un palier forcé (`deep`) : Rapide et Auto
 * n'ont rien à estimer (Auto choisit lui-même, Rapide exclut déjà le coûteux).
 * `staleTime` généreux — c'est une médiane produit, elle ne bouge pas d'une
 * minute à l'autre (même choix que `useEnrichmentDurationEstimate`).
 */
export function useChatModeEstimate(tier: 'fast' | 'deep', enabled: boolean) {
  return useQuery({
    queryKey: ['chat', 'mode-estimate', tier],
    queryFn: () => chatModeEstimateApi.estimate(tier),
    enabled,
    staleTime: 5 * 60_000,
  })
}
