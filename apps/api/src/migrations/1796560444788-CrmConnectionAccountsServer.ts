import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 19/10/2026 — L.6 : Zoho tourne dans plusieurs régions (eu, com, in, com.au, jp, ca, sa…). Le serveur de
 * comptes réel de l'organisation est rendu au callback OAuth (`accounts-server`) et doit servir au
 * rafraîchissement et à la révocation de CETTE connexion.
 *
 * NULLABLE, additive : une connexion déjà en base garde le défaut de la config (`ZOHO_ACCOUNTS_REGION`),
 * aucune régression ; rien n'est deviné.
 */
export class CrmConnectionAccountsServer1796560444788 implements MigrationInterface {
  public name = 'CrmConnectionAccountsServer1796560444788'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE crm_connections ADD COLUMN IF NOT EXISTS accounts_server text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE crm_connections DROP COLUMN IF EXISTS accounts_server`)
  }
}
