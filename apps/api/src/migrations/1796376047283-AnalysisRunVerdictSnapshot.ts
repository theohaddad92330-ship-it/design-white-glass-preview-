import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3212.4/.6 (épopée #3235) — « pourquoi cela a changé » et la révision
 * visible ont toutes les deux besoin de comparer DEUX dossiers successifs du
 * même compte. Le ledger (`commercial_outcomes`) est append-only mais ne
 * porte aucun verdict ; `accounts.raw_analysis` est écrasé à chaque run — le
 * verdict d'hier disparaît dès que l'analyse d'aujourd'hui se termine. Sans
 * une ligne immuable par run qui garde CE que ce run a conclu, aucun diff
 * n'est possible : on ne peut comparer que ce qu'on a gardé.
 */
export class AnalysisRunVerdictSnapshot1796376047283 implements MigrationInterface {
  name = 'AnalysisRunVerdictSnapshot1796376047283'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS verdict_snapshot jsonb`)
    await queryRunner.query(`
      COMMENT ON COLUMN analysis_runs.verdict_snapshot IS
        'Instantané {verdict, dominantFactors, noGoTrigger, profileVersion} timbré à la fin de la phase plan. NULL = run antérieur à la colonne, run sans plan, ou capture ratée — jamais un verdict deviné.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE analysis_runs DROP COLUMN IF EXISTS verdict_snapshot`)
  }
}
