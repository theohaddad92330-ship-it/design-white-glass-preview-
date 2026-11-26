import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Pricing v2, part 2 — enforce the 7-day Pro trial.
 *
 * Adds `subscriptions.trial_end` (set for `plan = 'trial'`, NULL for paid
 * plans). A trial past its `trial_end` is locked at consume time (no analyses /
 * enrichments) — see CreditsService. The signup trigger now stamps
 * `trial_end = now() + 7 days`; existing trial rows (converted from `free` in the
 * previous migration) get a fresh 7-day window so no one is locked out on deploy.
 */
export class TrialEndAndExpiry1785100000000 implements MigrationInterface {
  public name = 'TrialEndAndExpiry1785100000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_end timestamptz`)

    // Give current trial rows a 7-day window from now (they were converted from
    // `free` without a trial_end); paid plans keep NULL.
    await queryRunner.query(`
      UPDATE subscriptions
      SET trial_end = now() + interval '7 days'
      WHERE plan = 'trial' AND trial_end IS NULL
    `)

    // Signup trigger: seed the trial with its 7-day end.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION handle_new_user_credits()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, auth, extensions
      AS $$
      BEGIN
        INSERT INTO subscriptions (user_id, plan, accounts_limit, enrichment_credits, trial_end)
        VALUES (NEW.id, 'trial', 40, 75, now() + interval '7 days');
        RETURN NEW;
      END;
      $$
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
