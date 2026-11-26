import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import IORedis from 'ioredis'
import { parseRedisUrl } from '../../config/redis-connection'

/**
 * Default lock TTL. It must (a) comfortably outlast the clock skew between
 * replicas firing the same cron tick plus the job's own duration, and (b) stay
 * below the shortest schedule that uses the helper (hourly `oauth-cleanup`),
 * so the NEXT tick always finds the key expired.
 */
const DEFAULT_TTL_SECONDS = 10 * 60

/** Human-debuggable lock value: which replica won the tick. */
function replicaTag(): string {
  return process.env['RAILWAY_REPLICA_ID'] ?? process.env['HOSTNAME'] ?? `pid:${process.pid}`
}

/**
 * Distributed "one replica runs this scheduled tick" gate, backed by a single
 * Redis `SET key val EX ttl NX`.
 *
 * At N replicas every process discovers the same `@Cron` methods and fires
 * them N times per tick. Crons whose body is a guarded SQL statement survive
 * that (the WHERE re-evaluates under the row lock), but read-then-write crons
 * (relance reminders, weekly summaries) would duplicate notifications and
 * emails. Wrapping the cron body in {@link withLock} makes exactly one replica
 * execute it per tick.
 *
 * Deliberate design choices:
 * - The lock is NEVER released — it expires by TTL. Releasing on completion
 *   would re-open the tick for a replica whose clock fires the same cron a
 *   moment later (Railway replicas can skew by seconds); the TTL is the dedup
 *   window, not a mutex hold.
 * - Redis errors FAIL OPEN (the job runs unlocked, with a warning). A Redis
 *   blip must not silently skip a business job like the monthly quota reset;
 *   at worst a rare duplicate slips through — the same exposure as before
 *   this lock existed.
 * - Without REDIS_URL (dev / single instance) `withLock` runs the fn directly:
 *   single-replica behaviour is byte-for-byte unchanged.
 */
@Injectable()
export class SingletonLockService implements OnModuleDestroy {
  private readonly logger = new Logger(SingletonLockService.name)

  /** Lazily absent without REDIS_URL — then every withLock() runs directly. */
  private readonly redis?: IORedis

  constructor() {
    if (process.env['REDIS_URL']) {
      this.redis = new IORedis({ ...parseRedisUrl(), maxRetriesPerRequest: 3 })
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.redis?.quit()])
  }

  /**
   * Run `fn` on at most one replica per `ttlSeconds` window. Returns `true`
   * when the fn ran on THIS replica, `false` when another replica holds the
   * tick. Errors thrown by `fn` propagate — cron sites keep their own
   * try/catch, exactly as before.
   */
  async withLock(name: string, fn: () => Promise<void>, ttlSeconds: number = DEFAULT_TTL_SECONDS): Promise<boolean> {
    if (!this.redis) {
      await fn()
      return true
    }

    let acquired: 'OK' | null
    try {
      acquired = await this.redis.set(`bellum:cron-lock:${name}`, replicaTag(), 'EX', ttlSeconds, 'NX')
    } catch (error) {
      // Fail open: a lock-backend outage must not silently skip the job.
      this.logger.warn(`Cron lock '${name}' unavailable (Redis error) — running unlocked`, { error })
      acquired = 'OK'
    }

    if (acquired !== 'OK') {
      this.logger.log(`Cron '${name}' skipped — another replica holds this tick's lock`)
      return false
    }

    await fn()
    return true
  }
}

/**
 * Cron-site helper: run `fn` under the singleton lock when the service is
 * wired, or directly when it isn't (specs constructing hosts by hand, or the
 * `@Optional()` injection resolving to undefined). Keeps every `@Cron` body a
 * one-liner and the no-lock path identical to the pre-lock behaviour.
 */
export async function withSingletonLock(
  locks: SingletonLockService | undefined,
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  if (!locks) {
    await fn()
    return
  }
  await locks.withLock(name, fn)
}
