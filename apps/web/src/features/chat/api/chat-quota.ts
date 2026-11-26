import { chatQuotaStatusSchema, type ChatQuotaStatus } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #1957.5 — ce que le plafond quotidien laisse à la personne connectée
 * (`GET /ia/chat/quota`, cloisonné au JWT côté API).
 *
 * C'est une ANNONCE, pas une porte : une lecture en échec ou hors contrat rend
 * `null` et l'écran se tait. Jamais « 0 restant » pour une valeur qu'on n'a pas
 * pu lire — et jamais un écran qui tombe pour une note de bas de saisie.
 */
export async function fetchChatQuota(): Promise<ChatQuotaStatus | null> {
  try {
    const parsed = chatQuotaStatusSchema.safeParse(await apiFetch<unknown>({ path: '/ia/chat/quota' }))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
