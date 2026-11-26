import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Pricing v2, part 4 — the per-seat add-on.
 *
 * Adds `subscriptions.extra_seats` (paid seats beyond the 3 bundled in every
 * plan, +29€/mo each). Seat allowance = plan seats + extra_seats. Set from the
 * checkout metadata on `checkout.session.completed`; reset to 0 on cancellation.
 * Existing rows default to 0 (no extra seats).
 */
export class ExtraSeatsAddon1785300000000 implements MigrationInterface {
  public name = 'ExtraSeatsAddon1785300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS extra_seats integer NOT NULL DEFAULT 0`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
