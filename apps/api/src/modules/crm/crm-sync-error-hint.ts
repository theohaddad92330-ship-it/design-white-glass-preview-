import { looksLikeExpiredAuthorization } from '../../common/connector-error'
import type { CrmReadStatus } from '@bellum/contracts'

/**
 * #4467 — l'erreur brute d'un passage de synchro, NOMMÉE. Chaque règle lit le message tel que le client du
 * connecteur le rend et le rattache à un geste que l'utilisateur sait faire ; une erreur qu'on ne reconnaît pas
 * reste brute (`null`) — jamais une raison devinée.
 */
export function crmSyncErrorHint(provider: string, message: string | null): CrmReadStatus['lastErrorHint'] {
  if (!message) return null
  if (looksLikeExpiredAuthorization(message) || /\b401\b|unauthori[sz]ed|autorisation a expiré/i.test(message)) {
    return 'authorization_expired'
  }
  if (provider === 'hubspot' && /owners/i.test(message) && /scope|\b403\b|forbidden|permission/i.test(message)) {
    return 'hubspot_owners_scope'
  }
  if (provider === 'attio' && /deals/i.test(message) && /not found|\b404\b|not enabled|inactive|slug/i.test(message)) {
    return 'attio_deals_disabled'
  }
  if (provider === 'odoo' && /\b404\b/.test(message)) return 'odoo_endpoint_unreachable'
  return null
}
