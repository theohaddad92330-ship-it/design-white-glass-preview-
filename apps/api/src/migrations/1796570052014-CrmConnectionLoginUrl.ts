import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 21/10/2026 — #4431 : une organisation Salesforce à domaine personnalisé (My Domain, connexion unique
 * d'entreprise, sandbox) refuse `login.salesforce.com` et exige son propre hôte de connexion. Le domaine
 * saisi sur la carte est stocké PAR ESPACE sur la connexion ; le jeton, le rafraîchissement et la
 * révocation partent dessus.
 *
 * NULLABLE, additive : une connexion déjà en base (et tout autre CRM) garde l'hôte global de la config
 * (`SALESFORCE_LOGIN_URL`) — aucune régression, rien n'est deviné. `crm_connections.provider` est un TEXT
 * nu : aucune contrainte à élargir.
 */
export class CrmConnectionLoginUrl1796570052014 implements MigrationInterface {
  public name = 'CrmConnectionLoginUrl1796570052014'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE crm_connections ADD COLUMN IF NOT EXISTS login_url text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE crm_connections DROP COLUMN IF EXISTS login_url`)
  }
}
