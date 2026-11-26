import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2770.66/.67 (#2391.54/.55) — ce que la PERSONNE dit d'un bloc de plan de
 * journée, en plus du clic : un résultat en texte libre et une durée réelle en
 * minutes. Les deux sont NULLABLES et DÉCLARÉS — jamais déduits d'un minuteur
 * ni de l'agenda (#2391.56, « mesure jamais intrusive »), et un clic seul reste
 * un geste complet.
 *
 * Les bornes SQL (500 caractères, 1–1440 minutes) sont CELLES du contrat
 * (`FOCUS_PLAN_OUTCOME_NOTE_MAX`, `FOCUS_PLAN_ACTUAL_MINUTES_MAX`) : la
 * contrainte est posée AVANT le code qui écrit (GA-11/GA-12), CHECK NOMMÉS
 * (GA-177). Idempotente.
 */
export class FocusPlanBlockOutcomeDeclared1796413344271 implements MigrationInterface {
  public name = 'FocusPlanBlockOutcomeDeclared1796413344271'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE focus_plan_block_outcomes
        ADD COLUMN IF NOT EXISTS result_note text,
        ADD COLUMN IF NOT EXISTS actual_minutes integer
    `)
    await queryRunner.query(`
      ALTER TABLE focus_plan_block_outcomes
        DROP CONSTRAINT IF EXISTS focus_plan_block_outcomes_note_length_check,
        ADD CONSTRAINT focus_plan_block_outcomes_note_length_check
          CHECK (result_note IS NULL OR char_length(result_note) BETWEEN 1 AND 500)
    `)
    await queryRunner.query(`
      ALTER TABLE focus_plan_block_outcomes
        DROP CONSTRAINT IF EXISTS focus_plan_block_outcomes_minutes_check,
        ADD CONSTRAINT focus_plan_block_outcomes_minutes_check
          CHECK (actual_minutes IS NULL OR actual_minutes BETWEEN 1 AND 1440)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
