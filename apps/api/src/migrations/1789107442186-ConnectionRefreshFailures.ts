import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `refresh_failed_at` — la date du dernier échec de rafraîchissement d'un jeton
 * OAuth, sur les trois tables de connexion qui en gardent un (CRM, Google,
 * Microsoft).
 *
 * Pourquoi cette colonne existe. L'écran Intégrations lisait `expires_at` — la
 * date d'expiration du jeton d'ACCÈS, 30 min chez HubSpot, ~1 h chez Microsoft —
 * et en concluait « Autorisation expirée ». Un utilisateur qui ne touchait pas à
 * son CRM pendant une heure voyait donc une carte rouge et « les actions sont en
 * pause » alors que le jeton de rafraîchissement était là, dans la même ligne, et
 * que le prochain appel réel le renouvelait tout seul.
 *
 * Corriger ce faux positif ouvre le symétrique : un jeton de rafraîchissement
 * RÉVOQUÉ (mot de passe changé, application retirée côté fournisseur) se serait
 * alors affiché « connecté » jusqu'au premier clic qui échoue. D'où cette
 * colonne : elle porte le seul fait qui prouve qu'une reconnexion est vraiment
 * nécessaire — on a essayé de rafraîchir, et le fournisseur a refusé.
 *
 * Elle est remise à NULL au premier rafraîchissement réussi : un échec réseau
 * passager ne doit pas condamner une connexion saine.
 */
export class ConnectionRefreshFailures1789107442186 implements MigrationInterface {
  public name = 'ConnectionRefreshFailures1789107442186'

  private static readonly TABLES = ['crm_connections', 'google_connections', 'microsoft_connections']

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ConnectionRefreshFailures1789107442186.TABLES) {
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS refresh_failed_at timestamptz`)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ConnectionRefreshFailures1789107442186.TABLES) {
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS refresh_failed_at`)
    }
  }
}
