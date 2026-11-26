import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * L15 (contrat Louis 31/10/2026) — deux élargissements AVANT le code qui les
 * écrit (GA-11 / GA-12) :
 *
 *  1. `mission_risk_resolutions_risk_check` couvre les cinq exceptions neuves
 *     de `missionRiskSchema` — sans quoi « Marquer comme traité » sur l'une
 *     d'elles serait rejeté par PostgreSQL. DROP puis ADD sous le même nom :
 *     un CHECK ne s'ALTER pas en place (même mécanique que `1796322190000`).
 *  2. `mission_feedback.level` — le niveau DÉCLARÉ d'une entrée de
 *     satisfaction (#2408.16). NULLABLE : une note sans niveau reste valide et
 *     se lit « non mesuré », jamais un niveau par défaut.
 */
export class MissionRiskL15ExceptionsAndSatisfactionLevel1796610003098 implements MigrationInterface {
  name = 'MissionRiskL15ExceptionsAndSatisfactionLevel1796610003098'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_risk_resolutions
        DROP CONSTRAINT IF EXISTS mission_risk_resolutions_risk_check
    `)
    // #2408.3/.16/.17/.20/.21 — les cinq exceptions, EN FIN (GA-08).
    await queryRunner.query(`
      ALTER TABLE mission_risk_resolutions
        ADD CONSTRAINT mission_risk_resolutions_risk_check CHECK (
          risk IN (
            'renewal_not_started',
            'timesheet_disputed',
            'timesheet_missing',
            'margin_at_risk',
            'margin_unknown',
            'no_end_date',
            'missing_po',
            'ending_soon',
            'missing_owner',
            'invoice_blocked',
            'low_satisfaction',
            'relationship_threatened',
            'prolonged_absence',
            'consultant_unsecured',
            'action_without_owner'
          )
        )
    `)
    await queryRunner.query(`ALTER TABLE mission_feedback ADD COLUMN IF NOT EXISTS level text NULL`)
    await queryRunner.query(`
      ALTER TABLE mission_feedback
        DROP CONSTRAINT IF EXISTS mission_feedback_level_check
    `)
    await queryRunner.query(`
      ALTER TABLE mission_feedback
        ADD CONSTRAINT mission_feedback_level_check CHECK (level IS NULL OR level IN ('low', 'medium', 'high'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_feedback
        DROP CONSTRAINT IF EXISTS mission_feedback_level_check
    `)
    await queryRunner.query(`ALTER TABLE mission_feedback DROP COLUMN IF EXISTS level`)
    await queryRunner.query(`
      ALTER TABLE mission_risk_resolutions
        DROP CONSTRAINT IF EXISTS mission_risk_resolutions_risk_check
    `)
    await queryRunner.query(`
      ALTER TABLE mission_risk_resolutions
        ADD CONSTRAINT mission_risk_resolutions_risk_check CHECK (
          risk IN (
            'renewal_not_started',
            'timesheet_disputed',
            'timesheet_missing',
            'margin_at_risk',
            'margin_unknown',
            'no_end_date',
            'missing_po',
            'ending_soon',
            'missing_owner',
            'invoice_blocked'
          )
        )
    `)
  }
}
