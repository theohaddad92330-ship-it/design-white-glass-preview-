import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `plan_definitions.extra_seat_price_cents` — makes the per-seat add-on price
 * operator-editable, per plan, like every other field of the catalog.
 *
 * It was the last hardcoded price in the billing path (`EXTRA_SEAT_PRICE_CENTS`
 * in `credits.service.ts`): an operator could change a plan's price live but not
 * what an extra seat costs.
 *
 * The DEFAULT is the exact value that constant held (2900), and the column is
 * added with it, so every existing row is backfilled to today's price and
 * behaviour is unchanged the moment this ships. `IF NOT EXISTS` keeps a re-run
 * (or a release racing `migration:run`) idempotent and non-destructive — it
 * never resets a price an operator has since edited.
 */
export class PlanExtraSeatPrice1786400000000 implements MigrationInterface {
  public name = 'PlanExtraSeatPrice1786400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE plan_definitions
        ADD COLUMN IF NOT EXISTS extra_seat_price_cents INTEGER NOT NULL DEFAULT 2900
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
