import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Garder le cadrage de la collecte AVEC le run qu'il a cadré (Théo TF1 P0-02).
 *
 * L'écran de confirmation de périmètre ne portait que l'objet résolu et le
 * périmètre : ni priorité, ni exclusion. Maintenant que le commercial peut
 * cadrer sa collecte avant de payer, ce cadrage doit être RETROUVABLE — sinon
 * on ne peut ni expliquer un dossier amputé (« pourquoi TF1 PUB n'apparaît
 * pas ? ») ni rejouer le run à l'identique.
 *
 * `analysis_runs` est la seule table append-only et datée par run : le cadrage y
 * a sa place, comme `seller_context` (le profil vendeur épinglé au lancement) et
 * `source_health`. Colonne additive et nullable : NULL = run lancé sans cadrage
 * ou antérieur à la colonne — jamais « aucune exclusion » affirmé à tort.
 */
export class AnalysisRunScopeSelection1787960731902 implements MigrationInterface {
  name = 'AnalysisRunScopeSelection1787960731902'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS scope_selection jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE analysis_runs DROP COLUMN IF EXISTS scope_selection`)
  }
}
