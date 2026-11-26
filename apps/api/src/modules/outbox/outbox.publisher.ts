import { Injectable, Logger } from '@nestjs/common'
import type { DomainEvent } from '@bellum/events'
import type { EntityManager } from 'typeorm'
import { OutboxEntity } from '../../database/entities/outbox.entity'

/**
 * Transactional-outbox enqueue helper. Publishers call this inside their
 * own DB transaction so the outbox row is rolled back if the business
 * change is rolled back, and committed atomically when it commits.
 *
 *     await this.dataSource.transaction(async tx => {
 *       await tx.save(contact)
 *       await this.outbox.enqueue(tx, {
 *         type: 'contact.enriched',
 *         eventId: randomUUID(),
 *         occurredAt: new Date().toISOString(),
 *         contactId: contact.id, ...
 *       })
 *     })
 *
 * The publisher does NOT touch Redis directly — that's the drainer's job.
 * That separation lets Redis be temporarily unreachable without blocking
 * the request path.
 */
@Injectable()
export class OutboxPublisher {
  private readonly logger = new Logger(OutboxPublisher.name)

  /**
   * Insert one outbox row inside the caller's transaction. Returns the
   * persisted entity for traceability (e.g. logging, tests).
   */
  async enqueue(em: EntityManager, event: DomainEvent): Promise<OutboxEntity> {
    const row = em.getRepository(OutboxEntity).create({
      event_id: event.eventId,
      event_type: event.type,
      payload: event,
      status: 'pending',
      attempts: 0,
      last_error: null,
      published_at: null,
    })
    const saved = await em.getRepository(OutboxEntity).save(row)
    this.logger.debug?.('outbox enqueue', { eventId: event.eventId, type: event.type })
    return saved
  }

  /**
   * Convenience for callers that don't already own a transaction. Opens a
   * one-shot TX so a save+enqueue pair is still atomic. **Lite path**:
   * prefer the EntityManager overload above when the call site is already
   * inside a meaningful business transaction — wrapping a single insert is
   * pure ceremony.
   */
  async enqueueStandalone(em: EntityManager, event: DomainEvent): Promise<OutboxEntity> {
    return em.transaction(tx => this.enqueue(tx, event))
  }
}
