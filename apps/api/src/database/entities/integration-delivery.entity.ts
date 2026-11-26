import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

export type IntegrationDeliveryStatus = 'pending' | 'success' | 'failed'

/**
 * Delivery journal for self-serve outbound integrations (webhooks v2). One row
 * per outbound EVENT delivery — created `pending` when the event is enqueued,
 * then updated by the BullMQ worker on every attempt (latest attempt number,
 * HTTP status, sanitized error). Terminal states: `success` (2xx) or `failed`
 * (4xx config error, or retries exhausted).
 *
 * `error` is sanitized before write: URLs are scrubbed (the webhook URL embeds
 * a secret token) and the message is truncated — NEVER the event payload nor
 * the target URL in clear. FK cascades with the parent integration row.
 */
@Entity({ name: 'integration_deliveries' })
@Index('integration_deliveries_integration_created_idx', ['integration_id', 'created_at'])
export class IntegrationDeliveryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  integration_id: string

  /** Owner (mirrors the parent integration) — drives the read-only RLS policy. */
  @Column('uuid')
  user_id: string

  /** Machine-readable event name, e.g. `analysis.completed`. */
  @Column('text')
  event: string

  @Column('text', { default: 'pending' })
  status: IntegrationDeliveryStatus

  /** HTTP status of the LAST attempt; null when the request never got a response. */
  @Column('int', { nullable: true })
  http_status: number | null

  /** Latest attempt number (1-based); 0 while still queued, never attempted. */
  @Column('int', { default: 0 })
  attempt: number

  /** Sanitized failure summary (URL-scrubbed + truncated). Null on success. */
  @Column('text', { nullable: true })
  error: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
