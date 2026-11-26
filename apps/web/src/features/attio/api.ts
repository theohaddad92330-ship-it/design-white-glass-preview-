import { type CrmDisconnectResult, type ExportContactInput } from '@/features/crm/api'
import { apiFetch } from '@/lib/api'

export type AttioStatus = {
  configured: boolean
  connected: boolean
  provider?: 'attio'
  accountLabel?: string | null
  connectedAt?: string
}

export const attioApi = {
  status(): Promise<AttioStatus> {
    return apiFetch<AttioStatus>({ path: '/attio/status' })
  },
  /** Returns the Attio consent URL to redirect the browser to. */
  connectUrl(): Promise<{ url: string }> {
    return apiFetch<{ url: string }>({ path: '/attio/connect' })
  },
  /**
   * Efface TOUJOURS la ligne locale. `revoked` est toujours `false` chez Attio :
   * le fournisseur ne documente aucun endpoint de révocation (vérifié le
   * 30/08/2026 sur `llms.txt`, les trois pages OAuth et l'OpenAPI publique), donc
   * l'accès reste actif de son côté et `warning` le dit. Affichage :
   * `OAuthProviderCard.disconnect`.
   */
  disconnect(): Promise<CrmDisconnectResult> {
    return apiFetch<CrmDisconnectResult>({ path: '/attio', method: 'DELETE' })
  },
  /** Upsert-by-email: push a Bellum contact into Attio as a Person record. */
  exportContact(input: ExportContactInput): Promise<{ id: string; created: boolean }> {
    // #4186 — par la porte commune : la route directe `/attio/export` écrivait sans trace.
    return apiFetch<{ id: string; created: boolean }, ExportContactInput & { provider: 'attio' }>({
      path: '/crm/push/contact',
      method: 'POST',
      body: { ...input, provider: 'attio' },
    })
  },
}
