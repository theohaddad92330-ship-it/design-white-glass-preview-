/**
 * Shared options for any HTTP call wrapper (timeout / retry / caller abort propagation).
 * Consumed by service-specific clients like `IaClient`. Keeps every wrapper's public
 * surface identical so callers don't relearn the shape per integration.
 */
export type HttpCallOptions = {
  /** External abort signal (e.g. a BullMQ job's global deadline). Combined with internal timeout. */
  signal?: AbortSignal
  /** Per-call timeout override (ms). Each client defines its own default. */
  timeoutMs?: number
  /** Max attempts including the initial one (`1` disables retries). Each client defines its default. */
  maxAttempts?: number
}
