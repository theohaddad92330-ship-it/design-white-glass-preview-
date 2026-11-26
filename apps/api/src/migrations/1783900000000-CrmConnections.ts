import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `crm_connections` — per-user OAuth link to an external CRM (HubSpot for the
 * beta). Access/refresh tokens are stored encrypted at the application layer
 * (AES-256-GCM), so the columns are opaque TEXT here. One connection per
 * (user, provider) — enforced by a unique index. RLS scopes rows to their
 * owner. Migration owned here (NestJS = owner of métier tables).
 */
export class CrmConnections1783900000000 implements MigrationInterface {
  public name = 'CrmConnections1783900000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS crm_connections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
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
      CREATE UNIQUE INDEX IF NOT EXISTS crm_connections_user_provider_uidx
        ON crm_connections (user_id, provider)
    `)

    await queryRunner.query(`ALTER TABLE crm_connections ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE POLICY "Users can manage their own CRM connections"
        ON crm_connections
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
