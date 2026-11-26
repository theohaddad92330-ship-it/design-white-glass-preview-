import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * État des sources, par run — le socle de l'écran « État des sources ».
 *
 * Les dégradations SONT déjà relevées : `record_degradation(correlation_id,
 * source=…, reason=…)` est posé à ~30 endroits côté IA, et le graphe les publie
 * sur son événement terminal (`degraded_sources`). Mais elles ne survivaient que
 * dans `accounts.raw_analysis.run_cost`, or :
 *
 *  - une ré-analyse dédoublonne par `(workspace_id, siren)` et ÉCRASE la ligne
 *    `accounts` — la trace du run précédent disparaît ;
 *  - `accounts.updated_at` bouge dès qu'on édite le compte, donc il ne date pas
 *    le run.
 *
 * Résultat : personne ne pouvait répondre « Pappers est HS depuis quand ». On ne
 * le découvrait qu'en ouvrant un dossier vide.
 *
 * `analysis_runs` est la bonne ancre : append-only, une ligne immuable par run,
 * horodatée (`created_at` / `completed_at`). La colonne y stocke :
 *
 *   { degraded: [{source, reason, code}], observed: ["pappers", "brave", …] }
 *
 * `observed` = les sources réellement APPELÉES pendant le run (compteur d'appels
 * du breakdown provider). Sans elle on ne peut pas distinguer « la source va
 * bien » de « la source n'a pas été sollicitée » — et affirmer la première à
 * partir de la seconde serait fabriquer un état de santé.
 *
 * Additif, nullable, idempotent. NULL = run antérieur à la colonne = « inconnu »,
 * jamais « tout allait bien ».
 */
export class AnalysisRunSourceHealth1786812947183 implements MigrationInterface {
  public name = 'AnalysisRunSourceHealth1786812947183'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS source_health jsonb`)
    // L'écran lit « les N derniers runs, du plus récent au plus ancien » et ne
    // regarde que les lignes qui portent un état. Index partiel : il reste petit
    // même quand la table grossit.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_analysis_runs_source_health_created_at
         ON analysis_runs (created_at DESC)
       WHERE source_health IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_analysis_runs_source_health_created_at`)
    await queryRunner.query(`ALTER TABLE analysis_runs DROP COLUMN IF EXISTS source_health`)
  }
}
