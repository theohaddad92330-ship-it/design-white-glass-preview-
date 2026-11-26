import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2338 (double accord client / consultant) + #2409 (checklist de démarrage
 * J1) — les GESTES HUMAINS qui ouvrent le passage au démarrage. Catalogue et
 * verdict : `packages/contracts/src/schemas/mission-start-readiness.ts`
 * (GA-26) ; la contrainte `item_key` est posée AVANT le code qui l'écrit
 * (GA-11/GA-12).
 *
 * Un geste n'est jamais supprimé : une re-confirmation ou un retrait ARCHIVE
 * la ligne en vigueur (`archived_at`, `archived_by`) — on archive, on ne
 * supprime pas ; la dernière main humaine gagne. Une seule ligne en vigueur
 * par (mission, prérequis) — index unique partiel.
 *
 * Même patron RLS que `mission_amendments` (lecture par les membres de l'espace).
 */
export class MissionStartChecks1795999939046 implements MigrationInterface {
  public name = 'MissionStartChecks1795999939046'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mission_start_checks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        item_key text NOT NULL,
        proof text NOT NULL,
        confirmed_by uuid NOT NULL,
        confirmed_at timestamptz NOT NULL DEFAULT now(),
        archived_at timestamptz NULL,
        archived_by uuid NULL,
        CONSTRAINT mission_start_checks_item_key_check CHECK (item_key IN (
          'client_agreement', 'consultant_agreement', 'contract_signed', 'site_access'
        )),
        CONSTRAINT mission_start_checks_proof_check CHECK (length(btrim(proof)) > 0)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_mission_start_checks_live
        ON mission_start_checks (mission_id, item_key) WHERE archived_at IS NULL;
      ALTER TABLE mission_start_checks ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "mission_start_checks_workspace_read" ON mission_start_checks;
      CREATE POLICY "mission_start_checks_workspace_read" ON mission_start_checks FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mission_start_checks`)
  }
}
