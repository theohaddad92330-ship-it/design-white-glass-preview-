import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4016 L6 (décision Louis 11/10/2026) — LE PIPE « DÉTECTÉ, À REVOIR ».
 *
 * ⚠️⚠️ Renversement daté de #2320.22 / #2377.8 / #2320.3 : Bellum écrit SEUL
 * dans le pipe le passage qu'un signal fort rend probable (intérêt →
 * opportunité, shortlist → positionnement, entretien → mission), en statut
 * `detected`. Confirmer reste un geste d'humain (`decided_by`).
 *
 * Posée AVANT le code qui l'écrit (GA-11/GA-12) : les deux CHECK reprennent
 * `PIPELINE_DETECTION_KINDS` / `PIPELINE_DETECTION_STATUSES`
 * (`@bellum/contracts`). `source_key` dit l'unicité d'un passage — l'appel ou
 * l'entretien seul, la shortlist ET le profil pour un positionnement : un
 * rebalayage ne double jamais une ligne, et une ligne écartée ne revient pas.
 *
 * Toutes les FK portent `ON DELETE CASCADE` : une FK sans cascade a déjà cassé
 * le reset de la démo en silence.
 */
export class PipelineDetections1796440171265 implements MigrationInterface {
  name = 'PipelineDetections1796440171265'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pipeline_detections (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id       uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        kind               text NOT NULL,
        status             text NOT NULL DEFAULT 'detected',
        account_id         uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
        label              text NOT NULL,
        source_id          uuid NOT NULL,
        source_key         text NOT NULL,
        project_id         uuid,
        need_id            uuid,
        consultant_id      uuid,
        submission_id      uuid,
        created_object_id  uuid,
        detected_at        timestamptz NOT NULL DEFAULT now(),
        decided_at         timestamptz,
        decided_by         uuid,
        CONSTRAINT pipeline_detections_kind_check
          CHECK (kind IN ('interest_to_opportunity', 'shortlist_to_submission', 'interview_to_mission')),
        CONSTRAINT pipeline_detections_status_check
          CHECK (status IN ('detected', 'confirmed', 'dismissed')),
        CONSTRAINT pipeline_detections_decision_check
          CHECK ((status = 'detected' AND decided_at IS NULL) OR (status <> 'detected' AND decided_at IS NOT NULL)),
        CONSTRAINT pipeline_detections_source_unique UNIQUE (workspace_id, kind, source_key)
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS pipeline_detections_workspace_status
        ON pipeline_detections (workspace_id, status, detected_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS pipeline_detections_workspace_status`)
    await queryRunner.query(`DROP TABLE IF EXISTS pipeline_detections`)
  }
}
