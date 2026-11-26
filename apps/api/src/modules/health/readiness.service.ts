import { Injectable, Logger, Optional } from '@nestjs/common'
import IORedis from 'ioredis'
import { DataSource } from 'typeorm'
import { parseRedisUrl } from '../../config/redis-connection'
import { ANALYSIS_WORKER_NAME, WorkerReadinessRegistry } from '../worker-readiness/worker-readiness.registry'

/**
 * Verdict of the deploy readiness gate. `ready` is true ONLY when the process
 * booted, its Redis/BullMQ connection answers, AND the in-process analysis worker
 * is running. Railway is configured (railway.json `healthcheckPath`) to poll the
 * endpoint that returns this, so a build that can't reach Redis or bring up the
 * worker never turns green and is never promoted — the previous healthy deploy
 * stays live.
 */
export type ReadinessReport = {
  ready: boolean
  /** Redis (and therefore the BullMQ connection) answered a bounded round-trip. */
  redis: boolean
  /** The in-process analysis worker is registered and running. */
  worker: boolean
  /**
   * INC-04-10 — Postgres answered a bounded `SELECT 1` through the app's own
   * pool. REPORTED, NOT GATED: Railway's deploy healthcheck polls this path, and
   * a merely slow database must not fail a deploy. A process whose pool is
   * wedged is restarted by `PgPoolWatchdogService` instead. `null` = no
   * DataSource wired (nothing measured — never shown as "down").
   */
  postgres: boolean | null
  /** Per-worker liveness (diagnostics — surfaced in the payload, not gated on). */
  workers: Record<string, boolean>
  checkedAt: string
}

@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name)

  /**
   * Bounded probe budget — a Redis that doesn't answer in time is DOWN for the
   * gate. A hung probe must never hold a deploy's healthcheck open.
   */
  protected readonly checkTimeoutMs: number = 2_000

  constructor(
    private readonly workers: WorkerReadinessRegistry,
    // `@Optional()`: specs that build the service bare stay valid.
    @Optional() private readonly dataSource?: DataSource,
  ) {}

  /** Snapshot the two gating conditions (worker live + Redis reachable). */
  async check(): Promise<ReadinessReport> {
    const worker = this.workers.isLive(ANALYSIS_WORKER_NAME)
    const [redis, postgres] = await Promise.all([this.probeRedisSafe(), this.probePostgresSafe()])
    return {
      ready: redis && worker,
      redis,
      postgres,
      worker,
      workers: this.workers.snapshot(),
      checkedAt: new Date().toISOString(),
    }
  }

  /** Never throws — any failure (unreachable Redis, timeout) is a `false`. */
  private probeRedisSafe(): Promise<boolean> {
    return this.bounded('redis', () => this.probeRedis())
  }

  /** INC-04-10 — never throws; `null` when no DataSource is wired. */
  private async probePostgresSafe(): Promise<boolean | null> {
    if (!this.dataSource) return null
    return this.bounded('postgres', () => this.probePostgres())
  }

  private async bounded(name: string, probe: () => Promise<void>): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined
    try {
      await Promise.race([
        probe(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${name} probe timed out after ${this.checkTimeoutMs}ms`)),
            this.checkTimeoutMs,
          )
        }),
      ])
      return true
    } catch (error) {
      // Failure detail stays server-side; the gate only needs up/down.
      this.logger.warn(`Readiness ${name} probe failed`, {
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  /**
   * A fresh, single-shot Redis round-trip. A dedicated lazy client that never
   * retries (no offline queue) means a dead Redis fails FAST here instead of
   * poisoning the shared BullMQ / throttler connections with reconnect state.
   * `protected` so the spec can swap it for an up / down / hung double.
   */
  protected async probePostgres(): Promise<void> {
    await this.dataSource?.query('SELECT 1')
  }

  protected async probeRedis(): Promise<void> {
    const client = new IORedis({
      ...parseRedisUrl(),
      lazyConnect: true,
      connectTimeout: this.checkTimeoutMs,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    })
    try {
      await client.connect()
      await client.ping()
    } finally {
      client.disconnect()
    }
  }
}
