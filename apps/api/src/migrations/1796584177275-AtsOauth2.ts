import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4688 — BoondManager en OAuth2 (authorization_code + PKCE S256) : la Marketplace Boond interdit les jetons permanents.
 *
 * AJOUT SEUL, et avant le code qui écrit `'oauth2'` (GA-11 / GA-12) :
 *  - les jetons OAuth2 chiffrés comme ceux des CRM (`access_token_enc`, `refresh_token_enc`) ;
 *  - `expires_at` : posé depuis le `expires_in` RENDU par Boond, jamais depuis une durée supposée ;
 *  - `refresh_failed_at` : un refresh refusé se mémorise, la connexion se dit « à reconnecter », rien ne boucle ;
 *  - `scopes` : ce que Boond a réellement accordé ;
 *  - l'aller-retour d'autorisation (`oauth_state_hash`, `oauth_verifier_enc`, `oauth_started_at`) : le `code_verifier`
 *    PKCE reste côté serveur, chiffré, jamais dans l'URL ni dans un cookie ;
 *  - `credentials_enc` devient nullable : une connexion OAuth2 n'a pas de secret collé. Les lignes existantes gardent le leur ;
 *  - la contrainte `auth_mode` accepte `'oauth2'`, sans rien retirer des deux modes existants.
 */
export class AtsOauth21796584177275 implements MigrationInterface {
  public name = 'AtsOauth21796584177275'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ats_connections
        ADD COLUMN IF NOT EXISTS access_token_enc   text,
        ADD COLUMN IF NOT EXISTS refresh_token_enc  text,
        ADD COLUMN IF NOT EXISTS expires_at         timestamptz,
        ADD COLUMN IF NOT EXISTS refresh_failed_at  timestamptz,
        ADD COLUMN IF NOT EXISTS scopes             text,
        ADD COLUMN IF NOT EXISTS oauth_state_hash   text,
        ADD COLUMN IF NOT EXISTS oauth_verifier_enc text,
        ADD COLUMN IF NOT EXISTS oauth_started_at   timestamptz
    `)
    await queryRunner.query(`ALTER TABLE ats_connections ALTER COLUMN credentials_enc DROP NOT NULL`)
    await queryRunner.query(`ALTER TABLE ats_connections DROP CONSTRAINT IF EXISTS ats_connections_auth_mode_check`)
    await queryRunner.query(`
      ALTER TABLE ats_connections
        ADD CONSTRAINT ats_connections_auth_mode_check CHECK (auth_mode IN ('user_token', 'client_jwt', 'oauth2'))
    `)
  }

  public async down(): Promise<void> {
    // Ajout seul : on ne resserre jamais une contrainte ni ne retire une colonne qui peut porter un jeton vivant.
  }
}
