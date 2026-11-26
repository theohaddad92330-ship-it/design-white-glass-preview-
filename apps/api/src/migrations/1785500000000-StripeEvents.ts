import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Stripe webhook idempotency: a processed-events ledger keyed on `event.id`.
 * The webhook handler inserts the id first (ON CONFLICT DO NOTHING) and skips
 * anything already seen, so Stripe's at-least-once redelivery can't double-credit.
 */
export class StripeEvents1785500000000 implements MigrationInterface {
  public name = 'StripeEvents1785500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stripe_events (
        id text PRIMARY KEY,
        type text NOT NULL,
        processed_at timestamptz NOT NULL DEFAULT now()
      )
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
