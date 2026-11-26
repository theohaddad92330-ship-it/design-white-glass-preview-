import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Boucle de feedback des pushs de profil (annexe méthodo p22 « Feedback :
 * retenu / refusé, raison, apprentissage, réutilisation »).
 *
 * Capitalise l'issue de chaque push — la raison et l'apprentissage nourrissent le
 * prochain. Append-only. RLS = défense en profondeur (l'API tourne en service
 * role) : une ligne est visible aux membres de son workspace, repli sur user_id.
 */
export class ConsultantPushFeedback1788030118225 implements MigrationInterface {
  public name = 'ConsultantPushFeedback1788030118225'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS consultant_push_feedback (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id   uuid,
        user_id        uuid NOT NULL,
        consultant_id  uuid NOT NULL,
        opportunity_id uuid,
        outcome        text NOT NULL DEFAULT 'en_attente'
          CHECK (outcome IN ('retenu', 'refuse', 'en_attente')),
        reason         text,
        learning       text,
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS consultant_push_feedback_consultant_idx ON consultant_push_feedback (consultant_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS consultant_push_feedback_workspace_idx ON consultant_push_feedback (workspace_id)`,
    )
    await queryRunner.query(`ALTER TABLE consultant_push_feedback ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'consultant_push_feedback'
            AND policyname = 'Members read their workspace push feedback'
        ) THEN
          CREATE POLICY "Members read their workspace push feedback"
            ON consultant_push_feedback
            FOR SELECT
            USING (
              user_id = auth.uid()
              OR workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
            );
        END IF;
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS consultant_push_feedback`)
  }
}
