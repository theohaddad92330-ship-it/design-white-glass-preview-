import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'
import type { DomainEvent, DomainEventType } from '@bellum/events'

type OutboxStatus = 'pending' | 'published' | 'dead'

/**
 * Transactional outbox row. Created in the same DB transaction as the
 * business change it describes; drained out-of-band to Redis Streams by
 * OutboxDrainer. See `infra/supabase/migrations/20260505_outbox_table.sql`.
 */
@Entity({ name: 'outbox' })
export class OutboxEntity {
  /** Mirrors `payload.eventId`. The unique-ness of the eventId is the
   *  caller's responsibility — duplicates throw a PK violation. */
  @PrimaryColumn('uuid', { name: 'event_id' })
  event_id: string

  @Column('text', { name: 'event_type' })
  event_type: DomainEventType

  @Column('jsonb')
  payload: DomainEvent

  @Index()
  @Column('text', { default: 'pending' })
  status: OutboxStatus

  @Column('integer', { default: 0 })
  attempts: number

  @Column('text', { nullable: true, name: 'last_error' })
  last_error: string | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at: Date

  @Column('timestamptz', { nullable: true, name: 'published_at' })
  published_at: Date | null
}
