/**
 * SYNC-C — la cadence et les quotas de la synchro fréquente des CRM.
 *
 * Trois choses vivent ICI, à un seul endroit (garde GA-26) : l'intervalle (`CRM_SYNC_INTERVAL_MINUTES`),
 * le budget d'appels par fournisseur et par passage, et le recul exponentiel sur échecs consécutifs.
 */
import { CRM_WEBHOOK_PROVIDERS, type CrmProvider, type CrmWebhookProvider } from '@bellum/contracts'

export { CRM_WEBHOOK_PROVIDERS }
export type { CrmWebhookProvider }

const DEFAULT_INTERVAL_MINUTES = 15
/** Plancher : en deçà, un passage chevaucherait le suivant et le CRM du client verrait un martèlement. */
const MIN_INTERVAL_MINUTES = 5
const MAX_INTERVAL_MINUTES = 24 * 60

/**
 * Minutes entre deux passages d'un (espace, fournisseur). Absent, vide ou illisible : 15. Borné à [5, 1440] —
 * un `0` délibéré ne coupe pas la synchro (le coupe-circuit est `CRM_SYNC_DISABLED`), il est ramené au plancher.
 */
export function crmSyncIntervalMinutes(): number {
  const raw = (process.env['CRM_SYNC_INTERVAL_MINUTES'] ?? '').trim()
  if (!raw) return DEFAULT_INTERVAL_MINUTES
  const value = Math.floor(Number(raw))
  if (!Number.isFinite(value)) return DEFAULT_INTERVAL_MINUTES
  return Math.min(Math.max(value, MIN_INTERVAL_MINUTES), MAX_INTERVAL_MINUTES)
}

export function crmSyncIntervalMs(): number {
  return crmSyncIntervalMinutes() * 60_000
}

/**
 * Appels HTTP maximum PAR PASSAGE et par fournisseur (une page = un appel). Marge sous la limite officielle,
 * pour qu'un passage toutes les 15 min n'épuise jamais le quota du client (les autres outils l'utilisent aussi).
 */
export const CRM_CALL_BUDGET_PER_PASS: Readonly<Record<CrmProvider, number>> = {
  // HubSpot : 190 requêtes / 10 s et 650 000 / jour pour une app publique OAuth ; l'API search : 5 req/s.
  hubspot: 40,
  // Salesforce : 100 000 appels / 24 h (Enterprise) + 1 000 par licence — quota partagé par tout l'org du client.
  salesforce: 40,
  // Pipedrive : 80 requêtes / 2 s par jeton (régime à jetons, quota quotidien selon le forfait).
  pipedrive: 40,
  // Attio : 100 lectures / s ; 25 écritures / s.
  attio: 40,
  // Odoo : pas de limite officielle sur l'instance du client (JSON-RPC) — borne prudente, la sienne est la charge de son serveur.
  odoo: 20,
  // Zoho CRM : crédits API par 24 h selon l'édition (de 5 000 à 100 000+), 200 enregistrements par page.
  zoho: 30,
}

/**
 * Les CRM dont un webhook entrant est accepté (la contrainte SQL porte la même liste) et la variable de leur
 * secret (`agent_docs/env-reference.md`). Vit ICI, à un seul endroit : le service de webhooks la relit, et la carte
 * dit « en temps réel » ou « toutes les N min » d'après elle.
 */
export const CRM_WEBHOOK_SECRET_ENV: Record<CrmWebhookProvider, string> = {
  hubspot: 'HUBSPOT_WEBHOOK_SECRET',
  salesforce: 'SALESFORCE_WEBHOOK_SECRET',
}

/**
 * #4290.17 — comment un CRM branché reste à jour : par webhook (temps réel) SEULEMENT si son fournisseur en a un
 * ET que son secret est posé (sans lui la route répond 404) ; sinon, relu toutes les `CRM_SYNC_INTERVAL_MINUTES`.
 */
export function crmRefresh(provider: CrmProvider): { mode: 'webhook' } | { mode: 'poll'; everyMinutes: number } {
  const hooked = (CRM_WEBHOOK_PROVIDERS as readonly string[]).includes(provider)
  if (hooked && (process.env[CRM_WEBHOOK_SECRET_ENV[provider as CrmWebhookProvider]] ?? '').trim())
    return { mode: 'webhook' }
  return { mode: 'poll', everyMinutes: crmSyncIntervalMinutes() }
}

/** Passages maximum par objet et par déclenchement : le budget d'appels divisé par les deux objets lus. */
export function maxPassesFor(provider: CrmProvider): number {
  return Math.max(1, Math.floor(CRM_CALL_BUDGET_PER_PASS[provider] / 2 / 10))
}

const BACKOFF_CAP_MULTIPLE = 16

/**
 * Délai avant le prochain passage après `failures` échecs CONSÉCUTIFS : l'intervalle doublé à chaque échec,
 * plafonné à 16 × l'intervalle. 0 échec = l'intervalle normal. Un succès remet le compteur à zéro (l'appelant).
 */
export function backoffDelayMs(failures: number): number {
  const base = crmSyncIntervalMs()
  if (failures <= 0) return base
  return base * Math.min(2 ** failures, BACKOFF_CAP_MULTIPLE)
}

/** `Retry-After` (secondes ou date HTTP) → millisecondes ; `null` si absent ou illisible (jamais un délai deviné). */
export function retryAfterMs(header: string | null | undefined, now: Date = new Date()): number | null {
  const value = (header ?? '').trim()
  if (!value) return null
  if (/^\d+$/.test(value)) return Number(value) * 1000
  const at = Date.parse(value)
  return Number.isNaN(at) ? null : Math.max(0, at - now.getTime())
}

/** Une erreur de quota (429, ou message qui le dit) : le passage recule, il ne compte pas comme une panne du CRM. */
export function isRateLimited(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error)
  return /\b429\b|rate.?limit|too many requests/i.test(text)
}

/** Un timeout n'est pas un échec : l'état est `unknown`, le passage suivant repart. */
export function isTimeout(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error)
  return /timed? ?out|ETIMEDOUT|ECONNABORTED|aucune réponse en/i.test(text)
}

type CrmSyncPassState = 'ok' | 'failed' | 'rate_limited' | 'unknown'

/** Le compteur d'échecs après un passage : remis à zéro au succès, inchangé sur `unknown`, +1 sinon. */
export function nextFailureCount(previous: number, state: CrmSyncPassState): number {
  if (state === 'ok') return 0
  if (state === 'unknown') return previous
  return previous + 1
}
