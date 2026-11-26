import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3671.2bis — le geste « Mauvaise entreprise » sur une carte Découvrir :
 * le signal affiché n'appartient pas à ce SIREN, et ce SIREN ne doit plus
 * être rattaché aux recherches suivantes de cet espace.
 *
 * Table neuve plutôt qu'un élargissement d'`account_feedback` : ce dernier
 * exige un `account_id` (NOT NULL) — un candidat Découvrir n'en a pas encore,
 * précisément le sujet (cf. `discover_candidate_notes`, même raison). `verdict`
 * n'a qu'une valeur aujourd'hui ; la contrainte s'élargira (GA-11/12) le jour
 * où une autre nature de retour Découvrir apparaît.
 */
export class DiscoverCandidateFeedback1796437800003 implements MigrationInterface {
  name = 'DiscoverCandidateFeedback1796437800003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS discover_candidate_feedback (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        siren text NOT NULL,
        verdict text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT discover_candidate_feedback_verdict_check CHECK (verdict IN ('wrong_company')),
        CONSTRAINT discover_candidate_feedback_unique UNIQUE (workspace_id, siren, verdict)
      );
      CREATE INDEX IF NOT EXISTS idx_discover_candidate_feedback_workspace_siren ON discover_candidate_feedback (workspace_id, siren);
      ALTER TABLE discover_candidate_feedback ENABLE ROW LEVEL SECURITY;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS discover_candidate_feedback;`)
  }
}
