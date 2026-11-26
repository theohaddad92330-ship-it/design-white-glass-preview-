import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Repère « le plan mérite une actualisation » (annexe méthodo p27 : « le plan se
 * replanifie après chaque réponse »).
 *
 * Un événement contact (réponse, RDV, bounce, refus) périme le plan du compte. On
 * pose ce timestamp pour afficher un nudge ; le clic de l'utilisateur replanifie
 * (règle produit « on prépare, l'utilisateur déclenche »). Additive/nullable :
 * NULL = comportement historique.
 */
export class AccountReplanSuggested1788024531892 implements MigrationInterface {
  public name = 'AccountReplanSuggested1788024531892'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS replan_suggested_at timestamptz`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS replan_suggested_at`)
  }
}
