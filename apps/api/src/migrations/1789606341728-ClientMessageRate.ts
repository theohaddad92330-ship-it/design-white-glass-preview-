import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * D21 — le TJM apparaît-il dans le message de push envoyé au client ?
 *
 * Arbitrage du 20/08 : réglable par espace, ÉTEINT par défaut. Beaucoup d'ESN
 * négocient le tarif après l'entretien, et un TJM annoncé dans le premier
 * message devient un plafond dont on ne remonte pas.
 *
 * Le défaut `false` vaut aussi pour les espaces existants : c'est le sens le
 * plus prudent, et un réglage qui aurait démarré activé aurait fait partir des
 * montants que personne n'avait décidé d'annoncer.
 */
export class ClientMessageRate1789606341728 implements MigrationInterface {
  public name = 'ClientMessageRate1789606341728'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workspaces
        ADD COLUMN IF NOT EXISTS show_rate_in_client_message boolean NOT NULL DEFAULT false
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS show_rate_in_client_message`)
  }
}
