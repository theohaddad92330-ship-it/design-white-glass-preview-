import { Inject, Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import type { EventBus } from '@bellum/events'
import { Repository } from 'typeorm'
import { OutboxEntity } from '../../database/entities/outbox.entity'
import { EVENT_BUS } from './event-bus.token'

const BATCH_SIZE = 50
const MAX_ATTEMPTS = 10
const DRAIN_INTERVAL_MS = 2_000

/**
 * Reads pending outbox rows in created_at order and publishes them via the
 * EventBus. Runs every DRAIN_INTERVAL_MS via the NestJS scheduler.
 *
 * Idempotency contract: if the process crashes between `eventBus.publish`
 * and `repo.save({status: 'published'})`, the row stays `pending` and will
 * be republished on the next tick. Consumers must dedupe on `eventId` —
 * which they get for free because the bus stores the typed envelope and
 * Redis Streams gives at-least-once delivery anyway.
 *
 * **SANS VERROU :** (multi-replica safety) the pending rows are claimed with
 * `SELECT ... FOR UPDATE SKIP LOCKED` inside a transaction. When >1 API replica
 * drains on the same tick, each replica locks a *disjoint* set of rows — the
 * others skip the locked ones and pick up different work — instead of every
 * replica racing to publish the same rows (which would emit each event N times,
 * once per replica). The lock is held only for the duration of the batch's
 * publishes (Redis XADD, sub-millisecond each) and released on commit. At a
 * single instance this is behaviourally identical to a plain `find()` — nothing
 * else contends for the lock. A singleton tick lock would be strictly worse
 * here: it would serialise the whole drain across replicas on a 2-second beat,
 * turning parallel throughput into queue depth, to protect against a collision
 * the database already refuses. Held by GA-76.
 */
@Injectable()
export class OutboxDrainer {
  private readonly logger = new Logger(OutboxDrainer.name)
  /** Re-entrancy guard. The Interval decorator can fire while we're still
   *  draining if Redis is slow; we just no-op and let the next tick
   *  resume. */
  private inFlight = false

  constructor(
    @InjectRepository(OutboxEntity)
    private readonly repo: Repository<OutboxEntity>,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
  ) {}

  @Interval(DRAIN_INTERVAL_MS)
  async tick(): Promise<void> {
    if (this.inFlight) return
    this.inFlight = true
    try {
      await this.drain()
    } catch (err) {
      this.logger.error('Drainer tick failed', { error: err })
    } finally {
      this.inFlight = false
    }
  }

  /**
   * Drain at most BATCH_SIZE pending rows. Public for tests + manual
   * triggers (e.g. an admin route).
   */
  async drain(batchSize = BATCH_SIZE): Promise<{ published: number; failed: number }> {
    // One short-lived transaction per batch. The claim query locks the rows it
    // returns (FOR UPDATE SKIP LOCKED); publishing + the status write happen
    // while that lock is held, then the whole batch commits. A concurrent
    // replica's claim SKIPs these locked rows and grabs a different slice, so
    // no row is ever published by two replicas.
    const queryRunner = this.repo.manager.connection.createQueryRunner()

    let published = 0
    let failed = 0
    let started = false

    try {
      // #4616 — DANS le `try` : un `startTransaction()` qui lève (pool saturé, socket coupé) rendait sinon
      // jamais la connexion déjà prise par `connect()` — une fuite par tick (2 s), par réplica.
      await queryRunner.connect()
      await queryRunner.startTransaction()
      started = true
      const txRepo = queryRunner.manager.getRepository(OutboxEntity)
      const pending = await txRepo
        .createQueryBuilder('outbox')
        .where('outbox.status = :status', { status: 'pending' })
        .orderBy('outbox.created_at', 'ASC')
        .take(batchSize)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany()

      for (const row of pending) {
        try {
          await this.bus.publish(row.payload)
          row.status = 'published'
          row.published_at = new Date()
          row.last_error = null
          await txRepo.save(row)
          published += 1
        } catch (err) {
          failed += 1
          const message = err instanceof Error ? err.message : String(err)
          row.attempts = (row.attempts ?? 0) + 1
          row.last_error = message.slice(0, 1000)
          if (row.attempts >= MAX_ATTEMPTS) {
            row.status = 'dead'
            this.logger.error('Outbox row moved to dead after max attempts', {
              eventId: row.event_id,
              attempts: row.attempts,
              lastError: message,
            })
          } else {
            this.logger.warn('Outbox publish failed, will retry', {
              eventId: row.event_id,
              attempts: row.attempts,
              error: message,
            })
          }
          await txRepo.save(row)
        }
      }

      await queryRunner.commitTransaction()
    } catch (err) {
      // A failure here is an infra fault (DB/connection), not a per-row publish
      // error — those are handled above. Roll back so the claimed rows stay
      // `pending` and are retried on the next tick; the caller (`tick`) logs.
      if (started) await queryRunner.rollbackTransaction()
      throw err
    } finally {
      await queryRunner.release()
    }

    return { published, failed }
  }
}
