import { type CrmDisconnectResult, type ExportContactInput } from '@/features/crm/api'
import { apiFetch } from '@/lib/api'

export type SalesforceStatus = {
  configured: boolean
  connected: boolean
  provider?: 'salesforce'
  accountLabel?: string | null
  connectedAt?: string
}

export const salesforceApi = {
  status(): Promise<SalesforceStatus> {
    return apiFetch<SalesforceStatus>({ path: '/salesforce/status' })
  },
  /** Returns the Salesforce consent URL to redirect the browser to. */
  connectUrl(options: { domain?: string; sandbox?: boolean } = {}): Promise<{ url: string }> {
    // #4431 — le domaine d'organisation (facultatif) et la case sandbox ; rien : l'hôte global, comme avant.
    const query = new URLSearchParams()
    if (options.domain?.trim()) query.set('domain', options.domain.trim())
    if (options.sandbox) query.set('sandbox', 'true')
    const qs = query.toString()
    return apiFetch<{ url: string }>({ path: `/salesforce/connect${qs ? `?${qs}` : ''}` })
  },
  /**
   * Révoque server-side (best-effort) puis efface la ligne locale — TOUJOURS.
   * `revoked: false` + `warning` disent que Salesforce n'a pas confirmé la
   * révocation ; la déconnexion côté Bellum a quand même eu lieu (apps/api
   * commit d97ba6b1). Voir `OAuthProviderCard.disconnect` pour l'affichage.
   */
  disconnect(): Promise<CrmDisconnectResult> {
    return apiFetch<CrmDisconnectResult>({ path: '/salesforce', method: 'DELETE' })
  },
  /** Upsert-by-email: push a Bellum contact into Salesforce as a Contact record. */
  exportContact(input: ExportContactInput): Promise<{ id: string; created: boolean }> {
    // #4186 — par la porte commune : la route directe `/salesforce/export` écrivait sans trace.
    return apiFetch<{ id: string; created: boolean }, ExportContactInput & { provider: 'salesforce' }>({
      path: '/crm/push/contact',
      method: 'POST',
      body: { ...input, provider: 'salesforce' },
    })
  },
}
