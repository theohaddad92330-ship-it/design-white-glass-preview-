import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2417.3 / .4 / .5 — jalon, retainer, placement : DÉCLARATIFS minimaux.
 *
 * Tranché par Louis 22/09 soir (decisions §8) : jalon = libellé + date +
 * montant saisis ; prorata = jours ouvrés de la période ; garantie de
 * placement = durée en jours déclarée au contrat. Rien de calculé qui ne
 * vienne d'une saisie, source nommée (`manual`, c80) — la contrainte est
 * posée AVANT le code qui l'écrit (GA-11/GA-12).
 *
 *  - `mission_milestones` : un jalon s'ARCHIVE, il ne se supprime pas (on
 *    archive, on ne supprime pas) ;
 *  - `mission_billing_declarations` : UNE ligne par mission (clé = la
 *    mission), un réglage à un seul endroit (GA-26). Colonnes NULLABLES : rien
 *    de déclaré = `NULL`, jamais un défaut inventé.
 */
export class MissionBillingDeclarations1795999452361 implements MigrationInterface {
  public name = 'MissionBillingDeclarations1795999452361'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mission_milestones (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL,
        label text NOT NULL,
        due_on date NOT NULL,
        amount_cents bigint NOT NULL,
        source text NOT NULL DEFAULT 'manual',
        created_by uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        archived_at timestamptz NULL,
        CONSTRAINT mission_milestones_amount_check CHECK (amount_cents > 0),
        CONSTRAINT mission_milestones_label_check CHECK (char_length(btrim(label)) BETWEEN 1 AND 200),
        CONSTRAINT mission_milestones_source_check CHECK (source IN ('manual'))
      );
      CREATE INDEX IF NOT EXISTS idx_mission_milestones_mission_due
        ON mission_milestones (mission_id, due_on) WHERE archived_at IS NULL;
      ALTER TABLE mission_milestones ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "mission_milestones_workspace_read" ON mission_milestones;
      CREATE POLICY "mission_milestones_workspace_read" ON mission_milestones FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

      CREATE TABLE IF NOT EXISTS mission_billing_declarations (
        mission_id uuid PRIMARY KEY REFERENCES missions(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL,
        retainer_monthly_cents bigint NULL,
        placement_fee_cents bigint NULL,
        placement_guarantee_days integer NULL,
        source text NOT NULL DEFAULT 'manual',
        updated_by uuid NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT mission_billing_declarations_retainer_check CHECK (retainer_monthly_cents IS NULL OR retainer_monthly_cents > 0),
        CONSTRAINT mission_billing_declarations_fee_check CHECK (placement_fee_cents IS NULL OR placement_fee_cents > 0),
        CONSTRAINT mission_billing_declarations_guarantee_check CHECK (placement_guarantee_days IS NULL OR placement_guarantee_days BETWEEN 1 AND 730),
        CONSTRAINT mission_billing_declarations_source_check CHECK (source IN ('manual'))
      );
      ALTER TABLE mission_billing_declarations ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "mission_billing_declarations_workspace_read" ON mission_billing_declarations;
      CREATE POLICY "mission_billing_declarations_workspace_read" ON mission_billing_declarations FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mission_billing_declarations`)
    await queryRunner.query(`DROP TABLE IF EXISTS mission_milestones`)
  }
}
