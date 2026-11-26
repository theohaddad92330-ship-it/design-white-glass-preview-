/**
 * HTTP status classification for retry strategies.
 *
 * Transient statuses (network-level upstream issues the caller can't fix by changing the
 * payload) are worth retrying; permanent 4xx statuses are caller bugs and retrying them
 * just wastes time and quota.
 */

const TIMEOUT = 408
const TOO_MANY_REQUESTS = 429
const SERVER_ERROR_MIN = 500

export function isRetryableStatus(status: number): boolean {
  if (status >= SERVER_ERROR_MIN) return true
  return status === TIMEOUT || status === TOO_MANY_REQUESTS
}
