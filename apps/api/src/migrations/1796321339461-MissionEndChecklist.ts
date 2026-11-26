import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2414 (LAU-FINAL-128) / épopée #2986 — fin de mission : motif typé,
 * checklist de sortie, mission interrompue. Catalogue et verdict :
 * `packages/contracts/src/schemas/mission-end.ts` (GA-26) ; les contraintes
 * `end_reason`, `item_key`, `responsibility`, `risk` sont posées AVANT le
 * code qui les écrit (GA-11/GA-12).
 *
 * Même patron que `mission_start_checks` (`1795999939046`) : un geste n'est
 * jamais supprimé, une re-confirmation ARCHIVE la ligne en vigueur — on
 * archive, on ne supprime pas. Une seule ligne en vigueur par (mission,
 * item) — index unique partiel.
 *
 * `missions.end_reason` est un AJOUT — il ne remplace pas le motif libre déjà
 * lu par `account-missions.service.ts` (`endReasonsOf`, `record_field_audit`
 * `move_reason`) : les deux coexistent, l'un est le texte libre historique,
 * l'autre le motif TYPÉ que #2414 demande.
 *
 * `mission_interruptions` porte le NO-GO par construction : aucune colonne de
 * disponibilité n'est écrite à la déclaration — `availability_confirmed`
 * démarre à `false` et n'est levée que par un second geste humain séparé
 * (`availability_confirmed_by/_at`), jamais par le même appel.
 */
export class MissionEndChecklist1796321339461 implements MigrationInterface {
  public name = 'MissionEndChecklist1796321339461'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE missions ADD COLUMN IF NOT EXISTS end_reason text NULL;
      ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_end_reason_check;
      ALTER TABLE missions ADD CONSTRAINT missions_end_reason_check CHECK (end_reason IN (
        'date_prevue', 'renouvellement_refuse', 'interruption', 'remplacement',
        'demission', 'fin_budget', 'mauvais_fit', 'fin_projet'
      ));

      CREATE TABLE IF NOT EXISTS mission_end_checks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        item_key text NOT NULL,
        note text NOT NULL,
        confirmed_by uuid NOT NULL,
        confirmed_at timestamptz NOT NULL DEFAULT now(),
        archived_at timestamptz NULL,
        archived_by uuid NULL,
        CONSTRAINT mission_end_checks_item_key_check CHECK (item_key IN (
          'client_handover', 'client_documents', 'client_payment',
          'consultant_mobility', 'consultant_daily_rate', 'consultant_preferences',
          'consultant_cv_updated', 'consultant_consent', 'consultant_other_processes',
          'internal_actions', 'internal_references', 'internal_equipment', 'internal_documents'
        )),
        CONSTRAINT mission_end_checks_note_check CHECK (length(btrim(note)) > 0)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_mission_end_checks_live
        ON mission_end_checks (mission_id, item_key) WHERE archived_at IS NULL;
      ALTER TABLE mission_end_checks ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "mission_end_checks_workspace_read" ON mission_end_checks;
      CREATE POLICY "mission_end_checks_workspace_read" ON mission_end_checks FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

      CREATE TABLE IF NOT EXISTS mission_interruptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        responsibility text NOT NULL,
        risk text NOT NULL,
        confidentiality_acknowledged boolean NOT NULL DEFAULT false,
        non_solicitation_acknowledged boolean NOT NULL DEFAULT false,
        note text NOT NULL,
        availability_confirmed boolean NOT NULL DEFAULT false,
        availability_confirmed_by uuid NULL,
        availability_confirmed_at timestamptz NULL,
        declared_by uuid NOT NULL,
        declared_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT mission_interruptions_responsibility_check CHECK (responsibility IN (
          'client', 'consultant', 'esn', 'partage'
        )),
        CONSTRAINT mission_interruptions_risk_check CHECK (risk IN ('faible', 'moyen', 'eleve')),
        CONSTRAINT mission_interruptions_note_check CHECK (length(btrim(note)) >= 20),
        CONSTRAINT mission_interruptions_ack_check CHECK (
          confidentiality_acknowledged = true AND non_solicitation_acknowledged = true
        )
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_mission_interruptions_per_mission ON mission_interruptions (mission_id);
      ALTER TABLE mission_interruptions ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "mission_interruptions_workspace_read" ON mission_interruptions;
      CREATE POLICY "mission_interruptions_workspace_read" ON mission_interruptions FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS mission_interruptions;
      DROP TABLE IF EXISTS mission_end_checks;
      ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_end_reason_check;
      ALTER TABLE missions DROP COLUMN IF EXISTS end_reason;
    `)
  }
}
