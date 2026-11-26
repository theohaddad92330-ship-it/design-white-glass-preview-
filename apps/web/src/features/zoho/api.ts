import { type CrmDisconnectResult, type ExportContactInput } from '@/features/crm/api'
import { apiFetch } from '@/lib/api'

type ZohoStatus = {
  configured: boolean
  connected: boolean
  provider?: 'zoho'
  accountLabel?: string | null
  connectedAt?: string
}

export const zohoApi = {
  status(): Promise<ZohoStatus> {
    return apiFetch<ZohoStatus>({ path: '/zoho/status' })
  },
  /** Returns the Zoho consent URL (on the region's accounts server) to redirect the browser to. */
  connectUrl(): Promise<{ url: string }> {
    return apiFetch<{ url: string }>({ path: '/zoho/connect' })
  },
  /**
   * Révoque server-side (best-effort) puis efface la ligne locale — TOUJOURS.
   * `revoked: false` + `warning` disent que Zoho n'a pas confirmé la révocation ;
   * la déconnexion côté Bellum a quand même eu lieu.
   */
  disconnect(): Promise<CrmDisconnectResult> {
    return apiFetch<CrmDisconnectResult>({ path: '/zoho', method: 'DELETE' })
  },
  /** Upsert-by-email: push a Bellum contact into Zoho as a Contact record — through the common gate (#4186). */
  exportContact(input: ExportContactInput): Promise<{ id: string; created: boolean }> {
    return apiFetch<{ id: string; created: boolean }, ExportContactInput & { provider: 'zoho' }>({
      path: '/crm/push/contact',
      method: 'POST',
      body: { ...input, provider: 'zoho' },
    })
  },
}
