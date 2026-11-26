import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * OAuth 2.1 Authorization Server tables backing the MCP feature.
 *
 * - `oauth_clients`             — dynamically-registered public clients (RFC 7591)
 * - `oauth_authorization_codes` — single-use PKCE codes (SHA-256 hashed, 60s TTL)
 * - `oauth_refresh_tokens`      — rotating refresh tokens (hashed) with family lineage
 * - `oauth_consents`            — remembered user→client grants (the revoke switch)
 *
 * Only the API service role touches these (no per-user browser access), so RLS
 * is intentionally NOT enabled here — the app is the sole owner. Rows tied to a
 * user cascade-delete with `auth.users`.
 */
export class OAuthServer1784600000000 implements MigrationInterface {
  public name = 'OAuthServer1784600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oauth_clients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id TEXT NOT NULL,
        client_name TEXT,
        redirect_uris TEXT[] NOT NULL DEFAULT '{}',
        grant_types TEXT[] NOT NULL DEFAULT ARRAY['authorization_code','refresh_token']::text[],
        response_types TEXT[] NOT NULL DEFAULT ARRAY['code']::text[],
        token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
        scope TEXT,
        client_secret_hash TEXT,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS oauth_clients_client_id_uidx ON oauth_clients (client_id)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code_hash TEXT NOT NULL,
        client_id TEXT NOT NULL,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        redirect_uri TEXT NOT NULL,
        scope TEXT NOT NULL,
        resource TEXT,
        code_challenge TEXT NOT NULL,
        code_challenge_method TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS oauth_auth_codes_hash_uidx ON oauth_authorization_codes (code_hash)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token_hash TEXT NOT NULL,
        family_id UUID NOT NULL,
        parent_id UUID,
        replaced_by_id UUID,
        client_id TEXT NOT NULL,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        scope TEXT NOT NULL,
        resource TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS oauth_refresh_tokens_hash_uidx ON oauth_refresh_tokens (token_hash)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_family_idx ON oauth_refresh_tokens (family_id)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_user_idx ON oauth_refresh_tokens (user_id)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oauth_consents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        client_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        resource TEXT,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS oauth_consents_user_client_uidx ON oauth_consents (user_id, client_id)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
