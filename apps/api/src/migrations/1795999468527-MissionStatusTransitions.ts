import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2407.5 / #2407.6 — les state machines de la mission et de l'affectation.
 *
 * Tranché par Louis 22/09 soir (decisions §9) : table STRICTE, retour arrière
 * permis avec motif journalisé ; l'affectation reste indépendante du statut de
 * mission (#2407.7). La table des transitions vit dans
 * `packages/contracts/src/schemas/status-transitions.ts` (GA-26).
 *
 *  1. `missions_status_check` est ÉLARGIE avant le code qui écrit les huit
 *     statuts ajoutés (GA-11/GA-12) — les six historiques restent acceptés.
 *  2. `mission_assignments.status` : colonne NEUVE, `confirmed` pour les
 *     affectations existantes — elles ont été saisies comme décidées, pas
 *     comme des hypothèses ; « active » se déduirait des dates, et on ne
 *     devine pas.
 *  3. `mission_status_transitions` : le JOURNAL. Un retour arrière porte son
 *     motif, et la base le refuse sans (le dernier rempart).
 */
export class MissionStatusTransitions1795999468527 implements MigrationInterface {
  public name = 'MissionStatusTransitions1795999468527'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_status_check`)
    await queryRunner.query(`
      ALTER TABLE missions ADD CONSTRAINT missions_status_check
        CHECK (status IN ('onboarding', 'active', 'paused', 'ended', 'terminated', 'renewed', 'draft', 'ready_to_start', 'at_risk', 'renewal_pending', 'ending', 'completed', 'cancelled', 'archived'))
    `)
    await queryRunner.query(`
      ALTER TABLE mission_assignments
        ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed'
    `)
    await queryRunner.query(`
      ALTER TABLE mission_assignments
        DROP CONSTRAINT IF EXISTS mission_assignments_status_check,
        ADD CONSTRAINT mission_assignments_status_check
          CHECK (status IN ('planned', 'confirmed', 'active', 'absent', 'paused', 'ending', 'extended', 'completed', 'terminated', 'replaced'))
    `)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mission_status_transitions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        assignment_id uuid NULL,
        subject text NOT NULL,
        from_status text NOT NULL,
        to_status text NOT NULL,
        direction text NOT NULL,
        reason text NULL,
        actor_id uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT mission_status_transitions_subject_check CHECK (subject IN ('mission', 'assignment')),
        CONSTRAINT mission_status_transitions_direction_check CHECK (direction IN ('forward', 'backward')),
        CONSTRAINT mission_status_transitions_reason_check CHECK (direction <> 'backward' OR length(btrim(coalesce(reason, ''))) > 0),
        CONSTRAINT mission_status_transitions_assignment_check CHECK ((subject = 'assignment') = (assignment_id IS NOT NULL))
      );
      CREATE INDEX IF NOT EXISTS idx_mission_status_transitions_mission
        ON mission_status_transitions (mission_id, created_at DESC);
      ALTER TABLE mission_status_transitions ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "mission_status_transitions_workspace_read" ON mission_status_transitions;
      CREATE POLICY "mission_status_transitions_workspace_read" ON mission_status_transitions FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mission_status_transitions`)
    await queryRunner.query(`
      ALTER TABLE mission_assignments
        DROP CONSTRAINT IF EXISTS mission_assignments_status_check,
        DROP COLUMN IF EXISTS status
    `)
    // Les statuts ajoutés reviennent à leur pendant historique AVANT de
    // rétrécir la contrainte — sinon le retour arrière échouerait.
    await queryRunner.query(`
      UPDATE missions SET status = CASE
        WHEN status IN ('draft', 'ready_to_start') THEN 'onboarding'
        WHEN status IN ('at_risk', 'renewal_pending', 'ending') THEN 'active'
        WHEN status IN ('completed', 'archived') THEN 'ended'
        WHEN status = 'cancelled' THEN 'terminated'
        ELSE status END
    `)
    await queryRunner.query(`ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_status_check`)
    await queryRunner.query(`
      ALTER TABLE missions ADD CONSTRAINT missions_status_check
        CHECK (status IN ('onboarding', 'active', 'paused', 'ended', 'terminated', 'renewed'))
    `)
  }
}
