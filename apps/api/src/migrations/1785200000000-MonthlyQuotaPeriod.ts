import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Pricing v2, part 3 — monthly quota reset for paid plans.
 *
 * Adds `subscriptions.period_start` (the start of the current monthly window).
 * The reset cron (CreditsService.resetElapsedMonthlyQuotas) zeroes `accounts_used`
 * and tops `enrichment_credits` up to the plan quota once this is a month old,
 * then advances it. Existing rows default to `now()` so no one is reset on deploy;
 * their first reset lands a month later.
 */
export class MonthlyQuotaPeriod1785200000000 implements MigrationInterface {
  public name = 'MonthlyQuotaPeriod1785200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS period_start timestamptz NOT NULL DEFAULT now()`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
