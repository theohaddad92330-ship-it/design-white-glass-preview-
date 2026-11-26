import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Pricing v2 — remove the free tier, add the 7-day Pro trial, rename Scale→Business.
 *
 * - New signups get a `trial` row (full-Pro quotas: 40 analyses / 75 enrichments)
 *   instead of `free` (3 / 0). Trial-expiry enforcement (trial_end + lock) lands
 *   in a follow-up migration; this only flips the entry plan + quotas.
 * - Existing `free` rows become `trial` with the same Pro quotas (a fair grace
 *   window; expiry handled by the follow-up).
 * - Existing `scale` rows are renamed to `business` but KEEP their stored
 *   accounts_limit / enrichment_credits — paying customers are not down-quota'd
 *   mid-subscription; new limits apply on their next checkout/renewal.
 */
export class PricingV2TrialAndBusiness1785000000000 implements MigrationInterface {
  public name = 'PricingV2TrialAndBusiness1785000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Reseed the signup trigger: trial, not free.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION handle_new_user_credits()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, auth, extensions
      AS $$
      BEGIN
        INSERT INTO subscriptions (user_id, plan, accounts_limit, enrichment_credits)
        VALUES (NEW.id, 'trial', 40, 75);
        RETURN NEW;
      END;
      $$
    `)

    // 2) Convert existing free rows → trial (Pro quotas).
    await queryRunner.query(`
      UPDATE subscriptions
      SET plan = 'trial', accounts_limit = 40, enrichment_credits = 75
      WHERE plan = 'free'
    `)

    // 3) Rename scale → business, preserving each customer's paid quotas.
    await queryRunner.query(`
      UPDATE subscriptions SET plan = 'business' WHERE plan = 'scale'
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
