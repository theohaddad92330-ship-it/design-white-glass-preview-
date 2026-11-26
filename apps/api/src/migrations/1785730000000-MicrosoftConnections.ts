import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `microsoft_connections` — per-team OAuth link to Microsoft 365 (Outlook Mail +
 * Calendar via Microsoft Graph). Access/refresh tokens are stored encrypted at
 * the application layer (AES-256-GCM), so the columns are opaque TEXT here. One
 * connection per (user, provider) — enforced by a unique index. RLS scopes rows
 * to their owner. Dedicated table (not `crm_connections`) so the Microsoft
 * module stays self-contained. Migration owned here (NestJS = owner of métier
 * tables).
 */
export class MicrosoftConnections1785730000000 implements MigrationInterface {
  public name = 'MicrosoftConnections1785730000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS microsoft_connections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        workspace_id UUID,
        provider TEXT NOT NULL DEFAULT 'microsoft',
        external_account_id TEXT,
        account_label TEXT,
        access_token_enc TEXT NOT NULL,
        refresh_token_enc TEXT,
        expires_at TIMESTAMPTZ,
        scope TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS microsoft_connections_user_provider_uidx
        ON microsoft_connections (user_id, provider)
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS microsoft_connections_workspace_idx
        ON microsoft_connections (workspace_id)
    `)

    await queryRunner.query(`ALTER TABLE microsoft_connections ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE POLICY "Users can manage their own Microsoft connections"
        ON microsoft_connections
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
