import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2422.4 (épopée #2869, LAU-FINAL-136) — LE CONTRAT JURIDIQUE TYPÉ, la
 * fondation. Vocabulaire complet dans
 * `packages/contracts/src/schemas/contract.ts` (GA-26).
 *
 * Cinq écrivains de nuit consécutifs (24 au 27/09) ont vérifié que cette table
 * n'existait pas et que six sous-points de #2869 en dépendaient, sans la
 * créer — « système fondateur, plus d'un jour ». Cette migration pose la
 * PREMIÈRE tranche verticale : un type, une table, un appelant (voir
 * `contract.service.ts`), un écran.
 *
 * Même patron RLS que `mission_amendments` (workspace-scopé, lecture par les
 * membres de l'espace).
 */
export class LegalContracts1796322780310 implements MigrationInterface {
  public name = 'LegalContracts1796322780310'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS legal_contracts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        type text NOT NULL,
        label text NOT NULL,
        counterparty_name text NOT NULL,
        legal_entity_id uuid NULL REFERENCES legal_entities(id) ON DELETE SET NULL,
        owner_id uuid NULL,
        starts_on date NULL,
        ends_on date NULL,
        scope text NULL,
        tariff_note text NULL,
        volume_note text NULL,
        cap_amount_cents bigint NULL,
        payment_terms_days integer NULL,
        payment_terms_basis text NULL,
        notice_days integer NULL,
        auto_renew boolean NOT NULL DEFAULT false,
        documents jsonb NOT NULL DEFAULT '[]'::jsonb,
        source text NOT NULL DEFAULT 'unknown',
        status text NOT NULL DEFAULT 'draft',
        confidential boolean NOT NULL DEFAULT false,
        created_by uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT legal_contracts_type_check CHECK (type IN (
          'framework', 'mission_agreement', 'amendment', 'purchase_order',
          'subcontracting_agreement', 'partnership_agreement', 'consultant_contract',
          'convention', 'other'
        )),
        CONSTRAINT legal_contracts_status_check CHECK (status IN ('draft', 'signed', 'terminated')),
        CONSTRAINT legal_contracts_source_check CHECK (source IN (
          'direct', 'partner', 'subcontracting', 'unknown', 'portage'
        )),
        CONSTRAINT legal_contracts_payment_terms_basis_check CHECK (
          payment_terms_basis IS NULL OR payment_terms_basis IN ('invoice_date', 'end_of_month')
        ),
        CONSTRAINT legal_contracts_cap_amount_cents_check CHECK (cap_amount_cents IS NULL OR cap_amount_cents >= 0),
        CONSTRAINT legal_contracts_payment_terms_days_check CHECK (payment_terms_days IS NULL OR payment_terms_days >= 0),
        CONSTRAINT legal_contracts_notice_days_check CHECK (notice_days IS NULL OR notice_days >= 0),
        CONSTRAINT legal_contracts_dates_check CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on),
        CONSTRAINT legal_contracts_label_check CHECK (length(btrim(label)) > 0),
        CONSTRAINT legal_contracts_counterparty_name_check CHECK (length(btrim(counterparty_name)) > 0)
      );
      CREATE INDEX IF NOT EXISTS idx_legal_contracts_account
        ON legal_contracts (account_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_legal_contracts_workspace
        ON legal_contracts (workspace_id);
      ALTER TABLE legal_contracts ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "legal_contracts_workspace_read" ON legal_contracts;
      CREATE POLICY "legal_contracts_workspace_read" ON legal_contracts FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS legal_contracts`)
  }
}
