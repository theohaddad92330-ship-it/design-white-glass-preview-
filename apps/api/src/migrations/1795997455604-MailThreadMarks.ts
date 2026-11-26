import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LA DÉCISION MANUELLE sur un fil de messagerie (#2104.6 / #2104.7 / #2104.8) :
 * marqué traité, signalé non pertinent, ou rattaché à la main à un compte.
 *
 * Scopée par `user_id`, comme `mail_send_batches` (`MailSendBatches1788800000004`) :
 * la messagerie connectée est personnelle, jamais partagée par l'espace de
 * travail. Une ligne par (utilisateur, fil) — `state` et `account_id` peuvent
 * coexister, un fil rattaché à la main pouvant aussi être marqué traité.
 */
export class MailThreadMarks1795997455604 implements MigrationInterface {
  public name = 'MailThreadMarks1795997455604'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mail_thread_marks (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    uuid NOT NULL,
        thread_id  text NOT NULL,
        state      text,
        account_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT mail_thread_marks_user_thread UNIQUE (user_id, thread_id),
        CONSTRAINT mail_thread_marks_state_check CHECK (state IS NULL OR state IN ('treated', 'irrelevant'))
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS mail_thread_marks_user_idx ON mail_thread_marks (user_id)`)
    await queryRunner.query(`ALTER TABLE mail_thread_marks ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE POLICY mail_thread_marks_owner ON mail_thread_marks
          USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mail_thread_marks`)
  }
}
