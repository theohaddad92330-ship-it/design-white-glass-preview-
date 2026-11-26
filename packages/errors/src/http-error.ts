import type { ErrorOptions } from './error.js'

/**
 * Generic HTTP error thrown by any service client after receiving a non-OK response.
 *
 * - `status` is the raw HTTP status code.
 * - `body` is the response body (truncated by the caller if needed).
 * - `retryable` reflects whether the status is transient (5xx / 408 / 429) or terminal
 *   (other 4xx). Callers switch on this to decide whether to re-attempt or bubble up
 *   a non-retryable exception (e.g. BullMQ's `UnrecoverableError`).
 * - `endpoint` is the URL template — low-cardinality and safe for logs/metrics.
 */
export class HttpError extends Error {
  readonly name = 'HttpError'
  readonly status: number
  readonly body: string
  readonly retryable: boolean
  readonly endpoint: string
  readonly cause?: Error

  constructor(status: number, body: string, retryable: boolean, endpoint: string, options?: ErrorOptions) {
    super(`HTTP ${status} on ${endpoint}: ${body}`)
    this.status = status
    this.body = body
    this.retryable = retryable
    this.endpoint = endpoint
    this.cause = options?.cause
  }
}

/** Thrown when a request is aborted by its internal timeout or an external signal. */
export class HttpTimeoutError extends Error {
  readonly name = 'HttpTimeoutError'
  readonly timeoutMs: number
  readonly endpoint: string
  readonly cause?: Error

  constructor(timeoutMs: number, endpoint: string, options?: ErrorOptions) {
    super(`Request timed out after ${timeoutMs}ms on ${endpoint}`)
    this.timeoutMs = timeoutMs
    this.endpoint = endpoint
    this.cause = options?.cause
  }
}

/** Thrown when the retry budget is exhausted on a transient failure. */
export class HttpRetriesExhaustedError extends Error {
  readonly name = 'HttpRetriesExhaustedError'
  readonly attempts: number
  readonly endpoint: string
  readonly cause?: Error

  constructor(attempts: number, endpoint: string, options?: ErrorOptions) {
    super(
      `Request failed after ${attempts} attempts on ${endpoint}${options?.cause ? `: ${options.cause.message}` : ''}`,
    )
    this.attempts = attempts
    this.endpoint = endpoint
    this.cause = options?.cause
  }
}
