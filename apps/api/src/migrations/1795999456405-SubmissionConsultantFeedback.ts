import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2335.5 (LAU-FINAL-076) — le retour du CONSULTANT, une table à part.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TABLE SÉPARÉE, ET NON UNE COLONNE DE PLUS SUR `submission_feedback`
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue est explicite : « les deux feedbacks restent séparés ». Une même
 * table avec un discriminant `source` aurait rendu un mélange possible au
 * premier `SELECT *` mal filtré — exactement le défaut que la séparation existe
 * pour empêcher. Une table dédiée le rend structurellement impossible : aucune
 * requête sur `submission_feedback` ne peut jamais ramener un retour consultant.
 *
 * Huit axes, propres au consultant (intérêt, compréhension du besoin, manager,
 * mission, conditions, inquiétudes, disponibilité, décision) — pas les dix du
 * client. Même vocabulaire de verdict (`unknown`/`below`/`meets`/`above`) que
 * `submission_feedback`, pour ne pas inventer un second langage à côté de celui
 * qui existe déjà et que l'écran sait déjà traduire.
 */
export class SubmissionConsultantFeedback1795999456405 implements MigrationInterface {
  public name = 'SubmissionConsultantFeedback1795999456405'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS submission_consultant_feedback (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
        workspace_id uuid,
        interest text NOT NULL DEFAULT 'unknown',
        understanding text NOT NULL DEFAULT 'unknown',
        manager text NOT NULL DEFAULT 'unknown',
        mission text NOT NULL DEFAULT 'unknown',
        conditions text NOT NULL DEFAULT 'unknown',
        concerns text NOT NULL DEFAULT 'unknown',
        availability text NOT NULL DEFAULT 'unknown',
        decision text NOT NULL DEFAULT 'unknown',
        -- Ce que le consultant a dit, TEL QUEL — même garantie que le verbatim
        -- client : reformuler, c'est perdre la seule phrase utile en soutenance.
        verbatim text,
        recorded_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT submission_consultant_feedback_verdicts_check CHECK (
          interest IN ('unknown', 'below', 'meets', 'above')
          AND understanding IN ('unknown', 'below', 'meets', 'above')
          AND manager IN ('unknown', 'below', 'meets', 'above')
          AND mission IN ('unknown', 'below', 'meets', 'above')
          AND conditions IN ('unknown', 'below', 'meets', 'above')
          AND concerns IN ('unknown', 'below', 'meets', 'above')
          AND availability IN ('unknown', 'below', 'meets', 'above')
          AND decision IN ('unknown', 'below', 'meets', 'above')
        )
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS submission_consultant_feedback_submission_idx
         ON submission_consultant_feedback (submission_id, created_at DESC)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS submission_consultant_feedback`)
  }
}
