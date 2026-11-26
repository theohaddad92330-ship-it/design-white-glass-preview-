import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Google Workspace OAuth link (Calendar / Gmail / Drive), env-gated feature.
 *
 * A dedicated mirror of `crm_connections`: one row per (user, provider='google'),
 * workspace-scoped for team reads, tokens stored AES-256-GCM encrypted (reuses
 * the CRM token crypto). `IF NOT EXISTS` guards keep the migration idempotent so
 * an environment that never enables Google stays healthy.
 */
export class GoogleConnections1785700000000 implements MigrationInterface {
  public name = 'GoogleConnections1785700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS google_connections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        workspace_id uuid,
        provider text NOT NULL DEFAULT 'google',
        external_account_id text,
        account_label text,
        access_token_enc text NOT NULL,
        refresh_token_enc text,
        expires_at timestamptz,
        scope text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS google_connections_user_provider_uidx ON google_connections (user_id, provider)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_google_connections_workspace ON google_connections (workspace_id)`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
