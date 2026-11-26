import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import type { ApiKeyPrincipal } from '../api-keys/api-keys.service'

/**
 * Dedicated PER-KEY rate limit for the public `/v1` surface, on top of the
 * global per-IP throttler (both share the Redis storage registered in
 * `AppModule`; the trackers differ so the counters are independent).
 *
 * Mounted AFTER {@link ApiKeyGuard} in the controller's guard array, so
 * `req.apiKey` is set and the counter keys on the API key id — one client
 * behind a NAT can't exhaust another's budget, and one key can't dodge its
 * budget by rotating IPs. Falls back to the IP tracker if the principal is
 * somehow absent (fails safe: still throttled, just per-IP).
 */
@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const apiKey = req['apiKey'] as ApiKeyPrincipal | undefined
    if (apiKey?.keyId) return `api-key:${apiKey.keyId}`
    return super.getTracker(req)
  }
}
