import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `beta_feedback.client_context` — ce que le navigateur savait au moment du
 * signalement, au-delà de la capture d'écran : les appels HTTP en échec avec
 * leur identifiant de corrélation, le fil des gestes précédents, la version du
 * build (donc le commit) et l'état du navigateur.
 *
 * Une colonne JSON et non trois colonnes typées : c'est un même instant observé,
 * jamais interrogé champ par champ, et le rendre en une seule pièce évite trois
 * migrations pour une seule question.
 */
export class BetaFeedbackClientContext1789108903774 implements MigrationInterface {
  public name = 'BetaFeedbackClientContext1789108903774'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS client_context jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE beta_feedback DROP COLUMN IF EXISTS client_context`)
  }
}
