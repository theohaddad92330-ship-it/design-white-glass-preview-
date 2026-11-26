import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2189.39 (épopée #2940) — « Prochaine action toujours datée et attribuée »,
 * au niveau du POSITIONNEMENT (distinct de la prochaine action du BESOIN,
 * `project_needs` / `needNextAction`, GA-26 : ce n'est pas le même réglage —
 * un positionnement déjà présenté avance à son propre rythme).
 *
 * Trois colonnes NULLABLES, additives. La contrainte CHECK les tient
 * ENSEMBLE : soit les trois sont posées, soit les trois sont NULL — jamais
 * une étape sans date, ni une date sans porteur. Posée AVANT le code qui
 * écrit la valeur (GA-11/GA-12).
 */
export class SubmissionNextAction1796321396120 implements MigrationInterface {
  name = 'SubmissionNextAction1796321396120'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE submissions
        ADD COLUMN IF NOT EXISTS next_action_label text NULL,
        ADD COLUMN IF NOT EXISTS next_action_due_at date NULL,
        ADD COLUMN IF NOT EXISTS next_action_owner_id uuid NULL
    `)
    await queryRunner.query(`
      ALTER TABLE submissions
        DROP CONSTRAINT IF EXISTS submissions_next_action_check,
        ADD CONSTRAINT submissions_next_action_check
          CHECK (
            (next_action_label IS NULL AND next_action_due_at IS NULL AND next_action_owner_id IS NULL)
            OR
            (next_action_label IS NOT NULL AND next_action_due_at IS NOT NULL AND next_action_owner_id IS NOT NULL)
          )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE submissions
        DROP CONSTRAINT IF EXISTS submissions_next_action_check,
        DROP COLUMN IF EXISTS next_action_owner_id,
        DROP COLUMN IF EXISTS next_action_due_at,
        DROP COLUMN IF EXISTS next_action_label
    `)
  }
}
