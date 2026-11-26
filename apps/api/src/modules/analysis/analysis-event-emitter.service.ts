import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { DataSource, type EntityManager } from 'typeorm'
import { OutboxPublisher } from '../outbox/outbox.publisher'

/**
 * Thin facade that turns "phase X just succeeded / failed" into a typed
 * domain event sent through the outbox. The worker calls into this so it
 * doesn't have to know about the outbox shape, the eventId UUID, or the
 * envelope timestamps.
 *
 * **TX policy**: every method takes an optional ``manager`` so the caller
 * can enqueue the event in the SAME transaction as the business write
 * (e.g. ``save<Phase>`` in ``AnalysisPersistenceService``). That makes
 * ``analysis.phase_completed`` events the single source of truth for
 * resume — they exist if and only if the matching data write succeeded.
 * When ``manager`` is omitted we fall back to a one-shot TX through
 * ``enqueueStandalone``, which preserves backwards compatibility for
 * non-transactional callers (``started`` / ``completed`` / ``failed``
 * don't write business data).
 */
@Injectable()
export class AnalysisEventEmitter {
  private readonly logger = new Logger(AnalysisEventEmitter.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly outbox: OutboxPublisher,
  ) {}

  async started(input: {
    jobId: string
    accountId: string
    userId: string
    companyName: string
    correlationId?: string
  }): Promise<void> {
    await this.publish({
      type: 'analysis.started',
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      correlationId: input.correlationId,
      jobId: input.jobId,
      accountId: input.accountId,
      userId: input.userId,
      companyName: input.companyName,
    })
  }

  async phaseCompleted(
    input: {
      jobId: string
      accountId: string
      phase: 'research' | 'contacts' | 'classify' | 'plan'
      percent: number
      correlationId?: string
    },
    manager?: EntityManager,
  ): Promise<void> {
    await this.publish(
      {
        type: 'analysis.phase_completed',
        eventId: randomUUID(),
        occurredAt: new Date().toISOString(),
        correlationId: input.correlationId,
        jobId: input.jobId,
        accountId: input.accountId,
        phase: input.phase,
        percent: input.percent,
      },
      manager,
    )
  }

  async completed(input: {
    jobId: string
    accountId: string
    userId: string
    durationMs: number
    correlationId?: string
  }): Promise<void> {
    await this.publish({
      type: 'analysis.completed',
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      correlationId: input.correlationId,
      jobId: input.jobId,
      accountId: input.accountId,
      userId: input.userId,
      durationMs: input.durationMs,
    })
  }

  async failed(input: {
    jobId: string
    accountId: string
    userId: string
    errorCode: string
    userMessage: string
    correlationId?: string
  }): Promise<void> {
    await this.publish({
      type: 'analysis.failed',
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      correlationId: input.correlationId,
      jobId: input.jobId,
      accountId: input.accountId,
      userId: input.userId,
      errorCode: input.errorCode,
      userMessage: input.userMessage,
    })
  }

  /**
   * Internal helper. Swallows enqueue failures with a warn — losing an
   * audit event must never fail the pipeline for non-load-bearing events
   * (started/completed/failed). For ``phase_completed`` the caller passes
   * a ``manager`` and a thrown error rolls back the whole TX (data write
   * + event), which IS the desired behaviour: if the event can't be
   * enqueued, the resume flow can't see the checkpoint, so the data
   * write must roll back too.
   */
  private async publish(event: Parameters<OutboxPublisher['enqueue']>[1], manager?: EntityManager): Promise<void> {
    if (manager) {
      // Inside caller TX — let exceptions propagate so the whole TX rolls back.
      await this.outbox.enqueue(manager, event)
      return
    }
    try {
      await this.outbox.enqueueStandalone(this.dataSource.manager, event)
    } catch (err) {
      this.logger.warn('Failed to enqueue domain event', {
        type: event.type,
        eventId: event.eventId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
