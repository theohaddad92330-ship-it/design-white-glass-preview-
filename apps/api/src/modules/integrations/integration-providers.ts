import type { IntegrationProvider } from '../../database/entities/integration.entity'

/**
 * Central registry of every self-serve integration this module owns. Adding a
 * new webhook-style provider = one entry here (+ a card on the web settings
 * screen). The service and outbound layer are provider-agnostic: they read the
 * rule to know (a) which hosts are allowed — anti-SSRF pinning — and (b) how to
 * shape the outbound body.
 *
 * HubSpot is intentionally NOT here: it is a full OAuth flow owned by the CRM
 * module (`/crm/*`), not a pasted webhook URL.
 */

/** How a provider's outbound message body is shaped. */
type ProviderDelivery =
  /** Chat webhook — a single message under `bodyKey` (Slack/Teams/GChat use
   *  `text`, Discord uses `content`). */
  | { kind: 'chat'; bodyKey: 'text' | 'content' }
  /** Generic outgoing webhook — the structured `WebhookEvent` envelope. */
  | { kind: 'event' }

type ProviderRule = {
  /** Human label used in UI-facing error messages. */
  label: string
  delivery: ProviderDelivery
  /**
   * Allow-list the pasted URL must match (anti-SSRF: a user must not be able to
   * turn the delivery call into a request against an internal host). `null` for
   * the generic webhook, where the user legitimately owns an arbitrary https
   * endpoint — there we only enforce https (see `isHttpsUrl`).
   */
  hostRe: RegExp | null
}

export const PROVIDER_RULES: Record<IntegrationProvider, ProviderRule> = {
  slack: {
    label: 'Slack',
    delivery: { kind: 'chat', bodyKey: 'text' },
    hostRe: /^https:\/\/hooks\.slack\.com\//,
  },
  discord: {
    label: 'Discord',
    delivery: { kind: 'chat', bodyKey: 'content' },
    // Incoming webhook: https://discord.com/api/webhooks/{id}/{token}
    // (also discordapp.com, ptb/canary subdomains, optional /vNN version).
    hostRe: /^https:\/\/(canary\.|ptb\.)?(discord|discordapp)\.com\/api\/(v\d+\/)?webhooks\//,
  },
  teams: {
    label: 'Microsoft Teams',
    delivery: { kind: 'chat', bodyKey: 'text' },
    // Legacy O365 connector (*.webhook.office.com / outlook.office.com) OR the
    // new "Workflows" Power Automate trigger (*.logic.azure.com, sometimes :443).
    hostRe: /^https:\/\/([a-z0-9-]+\.)*(webhook\.office\.com|outlook\.office\.com|logic\.azure\.com)(:\d+)?\//i,
  },
  googlechat: {
    label: 'Google Chat',
    delivery: { kind: 'chat', bodyKey: 'text' },
    // Space incoming webhook: https://chat.googleapis.com/v1/spaces/…/messages?key=…&token=…
    hostRe: /^https:\/\/chat\.googleapis\.com\//,
  },
  mattermost: {
    label: 'Mattermost',
    delivery: { kind: 'chat', bodyKey: 'text' },
    // Self-hosted: host is arbitrary, so we pin the incoming-webhook PATH
    // (`/hooks/<id>`) instead of the host — still blocks a bare internal URL.
    hostRe: /^https:\/\/[^/]+\/hooks\/[A-Za-z0-9]+/,
  },
  webhook: {
    label: 'Webhook sortant',
    delivery: { kind: 'event' },
    hostRe: null,
  },
}

/** Every provider this module owns, for the status list and route validation. */
export const PROVIDERS = Object.keys(PROVIDER_RULES) as IntegrationProvider[]

/**
 * Every application event a user can subscribe an integration to. Adding an
 * event = one entry here (+ a checkbox label on the web settings screen); the
 * DTO validation and the fan-out filter both read this list.
 */
/**
 * #1952.29 — l'accusé de fin d'un travail long de Laura, ALLUMÉ PAR DÉFAUT
 * (tranché Louis 16/09/2026, contre la recommandation « éteint par défaut »).
 *
 * Nommé plutôt qu'écrit en clair : l'ÉMETTEUR (`workflow-runner.service.ts`,
 * module Action OS) et le FILTRE (`integrationWantsEvent`, ici) doivent lire le
 * même littéral — deux copies de cette chaîne, et l'annonce partirait sans
 * jamais pouvoir s'éteindre.
 *
 * « Allumé par défaut » n'est pas un défaut de code ici mais la conséquence de
 * `events == null` = tout (voir {@link integrationWantsEvent}) : un canal
 * branché sans choix explicite reçoit le nouvel événement. Décocher la case
 * « Laura a terminé » dans Réglages › Intégrations l'éteint pour ce canal.
 */
export const LAURA_JOB_COMPLETED_EVENT = 'laura.job.completed'

// Ajouté en FIN (même discipline que les enums du dépôt, GA-08) : un canal qui
// a déjà choisi sa liste ne voit pas son choix se décaler.
export const INTEGRATION_EVENTS = ['buy_signal', 'analysis.completed', LAURA_JOB_COMPLETED_EVENT] as const

export type IntegrationEventType = (typeof INTEGRATION_EVENTS)[number]

/**
 * Event filter for the fan-out: `events` is the row's JSONB allow-list.
 * `null`/`undefined` = every event — the pre-existing behaviour, so legacy
 * rows (created before the column existed) keep receiving everything.
 */
export function integrationWantsEvent(events: string[] | null | undefined, eventType: string): boolean {
  return events == null || events.includes(eventType)
}

/** Runtime guard for an untrusted route param. */
export function isProvider(value: string): value is IntegrationProvider {
  return Object.prototype.hasOwnProperty.call(PROVIDER_RULES, value)
}

function isHttpsUrl(url: string): boolean {
  return /^https:\/\/.+/.test(url)
}

/**
 * Validate a pasted URL against a provider's rule. Returns an error message
 * (for a 400) or `null` when the URL is acceptable. All providers require
 * https; host-pinned providers additionally require the allow-listed host.
 */
export function validateProviderUrl(provider: IntegrationProvider, url: string): string | null {
  const rule = PROVIDER_RULES[provider]
  if (!isHttpsUrl(url)) return `${rule.label} : une URL https est requise.`
  if (rule.hostRe && !rule.hostRe.test(url)) {
    return `${rule.label} : l'URL du webhook ne correspond pas au format attendu.`
  }
  return null
}
