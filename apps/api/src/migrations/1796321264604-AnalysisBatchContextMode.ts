import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `analysis_batches.context_mode` — #2922.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE COLONNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le lot multi-comptes (`/discover/lots`) lance chaque entreprise par le MÊME
 * chemin qu'Analyser (`AnalysisService.start`), qui LIT déjà un mode de
 * contexte (`workspaces.default_context_mode`, migration
 * `1796000665432-WorkspaceDefaultContextMode`). Sans cette colonne, le choix
 * fait à l'écran ne survivait pas à une reprise (`retry`) ni à une confirmation
 * d'entité ambiguë (`confirm`) : chacune relance `launch()` sans le mode
 * d'origine, donc silencieusement « Mon activité » — exactement ce que la
 * doctrine interdit (« ne pas repasser silencieusement à Mon activité »).
 *
 * NULLABLE, sans défaut : `NULL` = aucun choix fait au lancement, et chaque
 * sous-job retombe alors sur le défaut de l'espace — jamais un troisième mode
 * deviné ici. Les trois valeurs de `LAURA_CONTEXT_MODES` sont TOUTES un choix
 * valide (GA-08) ; `NULL` est un quatrième état, « pas réglé », distinct des
 * trois.
 *
 * GA-11/GA-12 — la contrainte CHECK couvre les trois modes canoniques dès la
 * création de la colonne, avant tout code qui l'écrit.
 */
export class AnalysisBatchContextMode1796321264604 implements MigrationInterface {
  public name = 'AnalysisBatchContextMode1796321264604'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE analysis_batches ADD COLUMN IF NOT EXISTS context_mode text`)
    await queryRunner.query(
      `ALTER TABLE analysis_batches ADD CONSTRAINT analysis_batches_context_mode_check
         CHECK (context_mode IS NULL OR context_mode IN ('my_activity', 'one_off_mission', 'neutral'))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE analysis_batches DROP CONSTRAINT IF EXISTS analysis_batches_context_mode_check`,
    )
    await queryRunner.query(`ALTER TABLE analysis_batches DROP COLUMN IF EXISTS context_mode`)
  }
}
