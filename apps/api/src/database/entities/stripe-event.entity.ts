import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm'

/**
 * Ledger of Stripe webhook events we've already processed. Stripe delivers
 * at-least-once and re-sends events on its own, so the handler dedupes on
 * `id` (= `event.id`, PK) to avoid double-crediting on a redelivery.
 */
@Entity({ name: 'stripe_events' })
export class StripeEventEntity {
  @PrimaryColumn('text')
  id: string

  @Column('text')
  type: string

  @CreateDateColumn({ type: 'timestamptz' })
  processed_at: Date
}
