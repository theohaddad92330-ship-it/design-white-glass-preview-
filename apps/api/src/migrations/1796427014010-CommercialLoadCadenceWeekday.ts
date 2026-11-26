import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3289.29 — « préférences utilisateur » de la cadence : le jour de la semaine que l'espace
 * impose à ses relances. Rejoint `workspace_commercial_load_settings` (un réglage d'espace vit
 * à UN seul endroit, GA-26) plutôt qu'une table neuve.
 *
 * NULLABLE : « non renseigné » n'est pas un jour (GA-18/GA-19) — le jour appris, puis le rythme
 * nominal, s'appliquent. Le CHECK dit la même borne que le contrat
 * (`SEND_TIMING_WEEKDAYS`) AVANT le code qui écrit (GA-11/GA-12).
 */
export class CommercialLoadCadenceWeekday1796427014010 implements MigrationInterface {
  name = 'CommercialLoadCadenceWeekday1796427014010'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workspace_commercial_load_settings
        ADD COLUMN IF NOT EXISTS cadence_weekday text NULL
    `)
    await queryRunner.query(`
      ALTER TABLE workspace_commercial_load_settings
        DROP CONSTRAINT IF EXISTS workspace_commercial_load_settings_cadence_weekday_check
    `)
    await queryRunner.query(`
      ALTER TABLE workspace_commercial_load_settings
        ADD CONSTRAINT workspace_commercial_load_settings_cadence_weekday_check
        CHECK (cadence_weekday IS NULL OR cadence_weekday IN ('monday','tuesday','wednesday','thursday','friday'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workspace_commercial_load_settings
        DROP CONSTRAINT IF EXISTS workspace_commercial_load_settings_cadence_weekday_check
    `)
    await queryRunner.query(`ALTER TABLE workspace_commercial_load_settings DROP COLUMN IF EXISTS cadence_weekday`)
  }
}
