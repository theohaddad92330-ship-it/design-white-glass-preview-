import { apiFetch } from '@/lib/api'

/** Self-serve integrations owned by the API `integrations` module (Slack, Discord,
 *  Microsoft Teams, Google Chat, generic webhook). HubSpot is separate — it goes
 *  through the CRM OAuth flow (`/crm/*`). Kept in sync with the API's
 *  `IntegrationProvider` union + provider registry. */
export type IntegrationProvider = 'slack' | 'discord' | 'teams' | 'googlechat' | 'mattermost' | 'webhook'

/** Application events an integration can subscribe to — mirror of the API's
 *  `INTEGRATION_EVENTS` registry (adding one = one entry there + here). */
// #1952.29 — « Laura a terminé » ajouté en FIN, allumé par défaut (tranché Louis
// 16/09/2026) : une liste `null` côté serveur veut dire « tout », donc un canal
// branché sans choix explicite reçoit le nouvel événement. La case le décoche.
export const INTEGRATION_EVENTS = ['buy_signal', 'analysis.completed', 'laura.job.completed'] as const

export type IntegrationEventType = (typeof INTEGRATION_EVENTS)[number]

export type IntegrationStatus = {
  provider: IntegrationProvider
  connected: boolean
  /** Non-sensitive display hint (URL host), never the secret URL. */
  label: string | null
  connectedAt: string | null
  /** Event allow-list; null = every event (default). */
  events: string[] | null
}

// Le journal de livraison (`GET /integrations/:provider/deliveries` — codes HTTP,
// tentatives, erreurs) n'est plus consommé ici : c'est de l'observabilité, elle
// vit dans le Dashboard Manager. L'endpoint API reste en place, il l'alimente.

export const integrationsApi = {
  list(): Promise<IntegrationStatus[]> {
    return apiFetch<IntegrationStatus[]>({ path: '/integrations' })
  },
  /** Save (encrypted, server-side) a provider's webhook URL. */
  set(provider: IntegrationProvider, url: string): Promise<IntegrationStatus> {
    return apiFetch<IntegrationStatus>({ path: `/integrations/${provider}`, method: 'PUT', body: { url } })
  },
  /** Choose which application events this integration receives (null = all). */
  setEvents(provider: IntegrationProvider, events: IntegrationEventType[] | null): Promise<IntegrationStatus> {
    return apiFetch<IntegrationStatus>({ path: `/integrations/${provider}/events`, method: 'PUT', body: { events } })
  },
  /** Send a real test message/event to the configured provider. */
  test(provider: IntegrationProvider): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>({ path: `/integrations/${provider}/test`, method: 'POST' })
  },
  disconnect(provider: IntegrationProvider): Promise<void> {
    return apiFetch<void>({ path: `/integrations/${provider}`, method: 'DELETE' })
  },
}
