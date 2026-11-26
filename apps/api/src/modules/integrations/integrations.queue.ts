import type { JobsOptions } from 'bullmq'

/**
 * BullMQ queue contract for outbound integration deliveries (webhooks v2).
 * One job per (event × connected integration). Retry policy:
 *
 *   - 1 initial attempt + 3 retries, fixed backoff ladder 30s → 5min → 30min
 *     (`integration-backoff`, registered on the worker — BullMQ only ships
 *     `exponential`/`fixed`).
 *   - Retry ONLY on transient failures: network error, timeout, HTTP 5xx, and
 *     HTTP 429 (rate-limit — transient by nature, not an invalid config).
 *   - NO retry on other 4xx (invalid/revoked webhook = config error: retrying
 *     cannot fix it) — the worker throws `UnrecoverableError` so BullMQ fails
 *     the job immediately.
 */

export const INTEGRATION_DELIVERY_QUEUE = 'integration-deliveries'

/** 1 initial attempt + 3 retries. */
export const DELIVERY_MAX_ATTEMPTS = 4

/** Backoff ladder (ms) for retries #1..#3: 30s, 5min, 30min. */
export const DELIVERY_BACKOFF_MS = [30_000, 300_000, 1_800_000] as const

/**
 * Delay before retry N. BullMQ calls the strategy with `attemptsMade` = number
 * of FAILED attempts so far (1 after the first failure), which maps 1-based
 * onto the ladder. Clamped so an out-of-range value reuses the last rung.
 */
export function deliveryBackoffMs(attemptsMade: number): number {
  const idx = Math.min(Math.max(attemptsMade, 1), DELIVERY_BACKOFF_MS.length) - 1
  return DELIVERY_BACKOFF_MS[idx]
}

/** Payload of one delivery job. The webhook URL is NOT here — the worker
 *  re-reads (and re-validates) it from the encrypted row at attempt time, so a
 *  URL never sits in Redis in clear and a disconnected integration stops
 *  delivering immediately. */
export type DeliveryJobData = {
  /** `integration_deliveries` row to journal attempts into. */
  deliveryId: string
  integrationId: string
  userId: string
  event: {
    type: string
    text: string
    data?: Record<string, unknown>
  }
}

export const DELIVERY_JOB_OPTIONS: JobsOptions = {
  attempts: DELIVERY_MAX_ATTEMPTS,
  backoff: { type: 'integration-backoff' },
  removeOnComplete: { age: 86_400, count: 1000 },
  removeOnFail: { age: 604_800 },
}

/**
 * Make a failure safe to persist in the journal: scrub every URL (a webhook
 * URL embeds a secret token) and truncate. NEVER include the event payload.
 */
export function sanitizeDeliveryError(error: unknown): string {
  const base = error instanceof Error ? error.message : String(error)
  const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : ''
  return `${base}${cause}`.replace(/https?:\/\/\S+/gi, '[url]').slice(0, 300)
}
