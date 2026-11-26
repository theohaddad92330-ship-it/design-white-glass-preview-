import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `subscriptions.topup_analyses` — one-off analysis capacity, separated from the
 * plan's monthly cap.
 *
 * An analysis top-up is sold as a ONE-OFF purchase ("Ajoutez des crédits
 * ponctuels sans changer d'abonnement"), and the CGV say a one-off top-up
 * expires at the end of the period it was bought for — the 30-day rollover they
 * grant since 30/08 (D252) covers the PLAN quota only. It was nonetheless
 * granted by incrementing
 * `accounts_limit` — the plan cap itself — while the monthly reset only zeroes
 * `accounts_used` and never restores `accounts_limit`. Nothing in the codebase
 * ever lowered it again (only a new checkout or an admin `assignPlan` rewrites
 * it), so a single 119 € "+50 analyses" pack raised the monthly quota by 50
 * every month, indefinitely.
 *
 * Splitting the two counters is what lets the monthly reset tell "plan quota"
 * (refilled) from "purchased extra" (expires with the cycle). The enforcement
 * path spends `accounts_limit + topup_analyses`, so a buyer keeps exactly the
 * capacity they paid for, for the cycle they paid it in.
 *
 * DEFAULT 0 — a fresh column changes nobody's capacity on deploy. This
 * migration deliberately does NOT try to detect and unwind top-ups already
 * folded into existing `accounts_limit` values: that is money customers have
 * already paid for, and clawing it back silently is a business decision, not a
 * schema one. Existing inflated caps are left exactly as they are; the fix is
 * forward-only. See the PR body for how to identify affected rows.
 *
 * `IF NOT EXISTS` keeps a re-run (or a release racing `migration:run`)
 * idempotent and non-destructive.
 */
export class SubscriptionTopupAnalyses1787050000000 implements MigrationInterface {
  public name = 'SubscriptionTopupAnalyses1787050000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscriptions
        ADD COLUMN IF NOT EXISTS topup_analyses INTEGER NOT NULL DEFAULT 0
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
