import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2407.4 — l'affectation porte son TAUX, son LIEU et son MODE de travail.
 *
 * Reco appliquée (décision Louis 22/09 soir §1) : les trois colonnes simples ;
 * consentement, documents et risques — trois sous-systèmes — se cadrent à part.
 *
 * Trois colonnes NULLABLES : une affectation existante n'a rien de saisi, et
 * `NULL` le dit — aucun défaut inventé. La contrainte du mode est posée AVANT
 * le code qui l'écrit (GA-11/GA-12).
 */
export class AssignmentRateLocationRemote1795999057132 implements MigrationInterface {
  public name = 'AssignmentRateLocationRemote1795999057132'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_assignments
        ADD COLUMN IF NOT EXISTS daily_rate_cents integer NULL,
        ADD COLUMN IF NOT EXISTS work_location text NULL,
        ADD COLUMN IF NOT EXISTS remote_mode text NULL
    `)
    await queryRunner.query(`
      ALTER TABLE mission_assignments
        DROP CONSTRAINT IF EXISTS mission_assignments_daily_rate_cents_check,
        ADD CONSTRAINT mission_assignments_daily_rate_cents_check
          CHECK (daily_rate_cents IS NULL OR daily_rate_cents >= 0),
        DROP CONSTRAINT IF EXISTS mission_assignments_work_location_check,
        ADD CONSTRAINT mission_assignments_work_location_check
          CHECK (work_location IS NULL OR char_length(work_location) BETWEEN 1 AND 200),
        DROP CONSTRAINT IF EXISTS mission_assignments_remote_mode_check,
        ADD CONSTRAINT mission_assignments_remote_mode_check
          CHECK (remote_mode IS NULL OR remote_mode IN ('onsite', 'hybrid', 'remote'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_assignments
        DROP CONSTRAINT IF EXISTS mission_assignments_remote_mode_check,
        DROP CONSTRAINT IF EXISTS mission_assignments_work_location_check,
        DROP CONSTRAINT IF EXISTS mission_assignments_daily_rate_cents_check,
        DROP COLUMN IF EXISTS remote_mode,
        DROP COLUMN IF EXISTS work_location,
        DROP COLUMN IF EXISTS daily_rate_cents
    `)
  }
}
