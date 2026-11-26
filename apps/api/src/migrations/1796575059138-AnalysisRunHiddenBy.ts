import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Théo B r2-mes-analyses.N1 — « Retirer cet élément de l'historique ».
 *
 * Retirer une analyse la MASQUE de l'historique de celui qui la retire ; le run et le dossier du compte restent
 * intacts (on archive, on ne supprime pas), et un collègue la voit toujours. Colonne neuve, additive, avec défaut :
 * aucune ligne existante ne change de lecture. Elle est posée AVANT le code qui l'écrit (GA-11/12).
 */
export class AnalysisRunHiddenBy1796575059138 implements MigrationInterface {
  public name = 'AnalysisRunHiddenBy1796575059138'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS hidden_by_user_ids uuid[] NOT NULL DEFAULT '{}'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE analysis_runs DROP COLUMN IF EXISTS hidden_by_user_ids`)
  }
}
