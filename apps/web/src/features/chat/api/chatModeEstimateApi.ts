import { apiFetch } from '@/lib/api'
import type { ChatModeEstimate } from '../view/chat-mode-estimate-text'

/**
 * #2448.8 / #2882.11 (épopée #2882) — coût et durée d'un tour Vérifié/Approfondi
 * (`tier: 'deep'`), estimés sur les mesures RÉELLES du même palier. Même
 * contrat que `contactsApi.enrichmentDurationEstimate` : `estimate` est
 * `null` sous 5 mesures, jamais un chiffre deviné (GA-18/19).
 */
export const chatModeEstimateApi = {
  estimate(tier: 'fast' | 'deep'): Promise<{ estimate: ChatModeEstimate }> {
    return apiFetch<{ estimate: ChatModeEstimate }>({
      path: `/ia/chat/mode-estimate?tier=${tier}`,
    })
  },
}
