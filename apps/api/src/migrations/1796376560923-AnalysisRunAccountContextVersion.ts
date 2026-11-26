import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2318.5 (LAU-FINAL-059) → épopée #3235 (#3212.3), lot E7 du 28/09 — le
 * SECOND des cinq identifiants encore câblés à `null` : `account_context_version`,
 * la révision du CONTEXTE DE COMPTE (fiche/CRM) qui a nourri le run.
 *
 * `accounts.updated_at` porte déjà cette révision (bumpée à chaque écriture
 * sur la fiche) — jamais relue par un run avant ce lot. La timbrer au
 * lancement (`AnalysisRunsService.recordStart`, même geste que
 * `analysis_version`, migration `1796376013417`) répond honnêtement à « quel
 * état de la fiche a produit ce dossier ? » sans rien recalculer : un run
 * plus ancien que cette colonne reste NULL — jamais une valeur devinée.
 */
export class AnalysisRunAccountContextVersion1796376560923 implements MigrationInterface {
  name = 'AnalysisRunAccountContextVersion1796376560923'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS account_context_version text`)
    await queryRunner.query(`
      COMMENT ON COLUMN analysis_runs.account_context_version IS
        'accounts.updated_at (ISO) au lancement du run — la révision de la fiche compte qui l’a nourri. NULL = run antérieur à la colonne.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE analysis_runs DROP COLUMN IF EXISTS account_context_version`)
  }
}
