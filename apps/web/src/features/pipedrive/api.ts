import { type CrmDisconnectResult, type ExportContactInput } from '@/features/crm/api'
import { apiFetch } from '@/lib/api'

export type PipedriveStatus = {
  configured: boolean
  connected: boolean
  provider?: 'pipedrive'
  accountLabel?: string | null
  connectedAt?: string
}

export const pipedriveApi = {
  status(): Promise<PipedriveStatus> {
    return apiFetch<PipedriveStatus>({ path: '/pipedrive/status' })
  },
  /** Returns the Pipedrive consent URL to redirect the browser to. */
  connectUrl(): Promise<{ url: string }> {
    return apiFetch<{ url: string }>({ path: '/pipedrive/connect' })
  },
  /**
   * Révoque server-side (best-effort) puis efface la ligne locale — TOUJOURS.
   * `revoked: false` + `warning` disent que Pipedrive n'a pas confirmé la
   * révocation ; la déconnexion côté Bellum a quand même eu lieu (apps/api
   * commit d97ba6b1). Voir `OAuthProviderCard.disconnect` pour l'affichage.
   */
  disconnect(): Promise<CrmDisconnectResult> {
    return apiFetch<CrmDisconnectResult>({ path: '/pipedrive', method: 'DELETE' })
  },
  /** Upsert-by-email: push a Bellum contact into Pipedrive as a Person record. */
  exportContact(input: ExportContactInput): Promise<{ id: string; created: boolean }> {
    // #4186 — par la porte commune : la route directe `/pipedrive/export` écrivait sans trace.
    return apiFetch<{ id: string; created: boolean }, ExportContactInput & { provider: 'pipedrive' }>({
      path: '/crm/push/contact',
      method: 'POST',
      body: { ...input, provider: 'pipedrive' },
    })
  },
}
