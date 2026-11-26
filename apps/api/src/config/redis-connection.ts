type RedisConnectionOptions = {
  host: string
  port: number
  password?: string
}

/**
 * Parse `REDIS_URL` for both BullMQ and the Throttler storage. Railway provides
 * URLs with a password component (redis://:pwd@host:port) that a naive split
 * would drop — preserve it here so both clients authenticate.
 */
export function parseRedisUrl(): RedisConnectionOptions {
  try {
    const raw = process.env['REDIS_URL']
    if (raw) {
      const url = new URL(raw)
      return {
        host: url.hostname,
        port: parseInt(url.port || '6379', 10),
        password: url.password || undefined,
      }
    }
  } catch {
    /* fallback to defaults */
  }
  return { host: 'localhost', port: 6379 }
}

/** ioredis options a reconnecting BullMQ connection needs, on top of the parsed
 *  `REDIS_URL`. Local (knip flags a type exported only for its own file); the
 *  value is produced by {@link bullConnectionOptions}. */
type BullConnectionOptions = RedisConnectionOptions & {
  maxRetriesPerRequest: null
  enableReadyCheck: boolean
  retryStrategy: (times: number) => number
}

/**
 * Connection options for `BullModule.forRoot`.
 *
 * On top of the parsed `REDIS_URL`, this pins the settings a resilient BullMQ
 * connection requires so a Redis blip (Railway restart, failover) can never
 * PERMANENTLY wedge the worker:
 *
 *  - `maxRetriesPerRequest: null` — BullMQ REQUIRES this on the client it drives:
 *    its blocking commands (`BRPOPLPUSH` on the wait list) must never be aborted
 *    by ioredis' per-request retry cap, or a job would be dropped. (BullMQ forces
 *    it internally too; pinning it here makes the contract explicit + testable and
 *    silences BullMQ's "maxRetriesPerRequest must be null" warning.)
 *  - `enableReadyCheck: true` — only issue commands once Redis reports itself
 *    loaded (the default; pinned so a config change can't silently drop it).
 *  - `retryStrategy` — reconnect FOREVER with bounded backoff (200ms → 3s cap);
 *    it never returns null, so ioredis keeps retrying until Redis is back, then
 *    BullMQ resumes draining the queue. A worker that can't reach Redis at boot
 *    fails the `/health/ready` gate rather than pretending to be healthy.
 */
export function bullConnectionOptions(): BullConnectionOptions {
  return {
    ...parseRedisUrl(),
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times: number) => Math.min(times * 200, 3_000),
  }
}
