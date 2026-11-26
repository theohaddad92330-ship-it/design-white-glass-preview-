import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le cloisonnement de portefeuille, réglable par espace (décision D5).
 *
 * `DEFAULT 'open'` n'est pas un détail d'implémentation : c'est la promesse que
 * cette migration ne change le comportement d'AUCUN espace existant. Un
 * commercial qui voyait deux cents comptes hier en voit deux cents aujourd'hui.
 * Le réglage inverse — cloisonner par défaut et laisser ouvrir — aurait fait
 * disparaître des portefeuilles entiers au déploiement, sans que personne ne
 * l'ait demandé.
 */
export class PortfolioVisibility1789519437265 implements MigrationInterface {
  name = 'PortfolioVisibility1789519437265'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workspaces
        ADD COLUMN IF NOT EXISTS portfolio_visibility text NOT NULL DEFAULT 'open'
    `)
    await queryRunner.query(`ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_portfolio_visibility_check`)
    await queryRunner.query(`
      ALTER TABLE workspaces ADD CONSTRAINT workspaces_portfolio_visibility_check
        CHECK (portfolio_visibility IN ('open', 'restricted'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_portfolio_visibility_check`)
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS portfolio_visibility`)
  }
}
