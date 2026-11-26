import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Sales-led (invoice-billed) provisioning.
 *
 * 1. `subscriptions.billing_mode` — EXPLICIT billing ownership: `stripe` (the
 *    self-serve subscription drives plan + quotas) or `manual` (an operator
 *    negotiated the terms; the client is invoiced offline and there is no
 *    Stripe subscription at all).
 *
 *    This is deliberately a column and not an inference from
 *    `stripe_subscription_id IS NULL`. Absence of a Stripe id is AMBIGUOUS —
 *    it also means "trial", "checkout abandoned", "signup half-finished". Every
 *    background job that has to answer "is this workspace entitled to anything"
 *    needs to tell those apart, and inferring it from the NULL is exactly the
 *    bug class that produces a silent lockout four weeks after the sale.
 *
 *    Existing rows default to `stripe`: nothing changes for anyone already live.
 *
 * 2. `manual_billing_terms` — what was actually sold, for the operator's eyes.
 *    Records the commercial terms only (amount, cycle, start date, paid/unpaid,
 *    and a free-text reference for the invoice number issued in the accounting
 *    tool). It is NOT an invoicing engine: no document is generated, no dunning
 *    runs, nothing is sent to the client from here.
 */
export class ManualBillingProvisioning1786901337204 implements MigrationInterface {
  public name = 'ManualBillingProvisioning1786901337204'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'stripe'`,
    )
    // Constrain at the DB edge: a typo'd mode would otherwise read as "not
    // stripe" in some paths and "not manual" in others — the worst of both.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_billing_mode_check') THEN
          ALTER TABLE subscriptions
            ADD CONSTRAINT subscriptions_billing_mode_check CHECK (billing_mode IN ('stripe', 'manual'));
        END IF;
      END $$;
    `)
    // The monthly-reset and webhook sweeps filter on it; keep the scan cheap.
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_billing_mode ON subscriptions (billing_mode)`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS manual_billing_terms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
        amount_cents integer NOT NULL DEFAULT 0,
        currency text NOT NULL DEFAULT 'EUR',
        period text NOT NULL DEFAULT 'yearly',
        start_date date NOT NULL DEFAULT CURRENT_DATE,
        payment_status text NOT NULL DEFAULT 'unpaid',
        reference text,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT manual_billing_terms_period_check
          CHECK (period IN ('monthly', 'quarterly', 'yearly', 'one_off')),
        CONSTRAINT manual_billing_terms_payment_status_check
          CHECK (payment_status IN ('unpaid', 'paid'))
      )
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
