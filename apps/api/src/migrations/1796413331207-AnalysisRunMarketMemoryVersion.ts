import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3235 (#3212.3, lot Q03 du 30/09) — le TROISIÈME des cinq identifiants de
 * version câblés à `null` : `market_memory_version`, la version du jeu de
 * données mémoire marché que la phase `plan` du run a RÉELLEMENT lu.
 *
 * Timbrée à la complétion (`AnalysisRunsService.completeLatest`) depuis
 * `run_completed.summary.market_memory_version`, posée par le plan seulement
 * après une lecture à couverture avérée. NULL = run antérieur à la colonne, ou
 * run qui n'a pas consulté la mémoire marché — jamais une valeur devinée.
 */
export class AnalysisRunMarketMemoryVersion1796413331207 implements MigrationInterface {
  name = 'AnalysisRunMarketMemoryVersion1796413331207'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS market_memory_version text`)
    await queryRunner.query(`
      COMMENT ON COLUMN analysis_runs.market_memory_version IS
        'Version du jeu de données mémoire marché lu par la phase plan du run. NULL = run antérieur à la colonne, ou mémoire marché non consultée.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE analysis_runs DROP COLUMN IF EXISTS market_memory_version`)
  }
}
