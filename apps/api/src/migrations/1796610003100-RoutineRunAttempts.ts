import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2843.20/.21/.24 (lot L13) — la reprise d'une occurrence échouée et sa durée.
 *
 * - `attempt` (1 à 3) : une reprise réécrit la MÊME ligne ; la contrainte borne
 *   la valeur AVANT que le code ne l'écrive (GA-11/12). Les lignes existantes
 *   valent 1 : elles n'ont jamais été reprises.
 * - `attempted_at` : base du délai de reprise ; NULL sur les lignes existantes
 *   (le service retombe alors sur `created_at`).
 * - `duration_ms` : back-office seul ; NULL = non mesurée, jamais 0.
 *
 * Purement additive : aucune ligne n'est réécrite ni supprimée.
 */
export class RoutineRunAttempts1796610003100 implements MigrationInterface {
  public name = 'RoutineRunAttempts1796610003100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE routine_runs
        ADD COLUMN IF NOT EXISTS attempt int NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS attempted_at timestamptz,
        ADD COLUMN IF NOT EXISTS duration_ms int
    `)
    await queryRunner.query(`
      ALTER TABLE routine_runs
        ADD CONSTRAINT routine_runs_attempt_check CHECK (attempt BETWEEN 1 AND 3),
        ADD CONSTRAINT routine_runs_duration_check CHECK (duration_ms IS NULL OR duration_ms >= 0)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE routine_runs DROP CONSTRAINT IF EXISTS routine_runs_duration_check`)
    await queryRunner.query(`ALTER TABLE routine_runs DROP CONSTRAINT IF EXISTS routine_runs_attempt_check`)
    await queryRunner.query(`
      ALTER TABLE routine_runs
        DROP COLUMN IF EXISTS duration_ms,
        DROP COLUMN IF EXISTS attempted_at,
        DROP COLUMN IF EXISTS attempt
    `)
  }
}
