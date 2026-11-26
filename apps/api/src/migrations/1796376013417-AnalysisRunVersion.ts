import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2318.5 (LAU-FINAL-059) → épopée #3235 (#3212.3) — le CINQUIÈME des cinq
 * identifiants de `analysisVersioningSchema` restait câblé à `null` faute de
 * sous-système qui le timbre : `analysis_version`, la révision du PIPELINE
 * d'analyse lui-même.
 *
 * La seule révision réellement connue du process qui exécute le run est celle
 * de son déploiement — la même source que `GET /version` et `GET /health/status`
 * lisent déjà (`SENTRY_RELEASE` / `RAILWAY_GIT_COMMIT_SHA` / `GIT_COMMIT`,
 * `health.controller.ts` / `status.service.ts`). L'écrire sur le run au
 * lancement (`AnalysisRunsService.recordStart`) répond honnêtement à « quelle
 * révision du pipeline a produit ce dossier ? » sans rien inventer : un run
 * plus ancien que cette colonne, ou lancé hors d'un déploiement identifié,
 * reste NULL — jamais une valeur devinée.
 */
export class AnalysisRunVersion1796376013417 implements MigrationInterface {
  name = 'AnalysisRunVersion1796376013417'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS analysis_version text`)
    await queryRunner.query(`
      COMMENT ON COLUMN analysis_runs.analysis_version IS
        'Révision du pipeline (SENTRY_RELEASE/RAILWAY_GIT_COMMIT_SHA/GIT_COMMIT) au lancement du run. NULL = run antérieur à la colonne ou déploiement non identifié — jamais une valeur devinée.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE analysis_runs DROP COLUMN IF EXISTS analysis_version`)
  }
}
