import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `integrations` — per-user self-serve outbound integrations (Slack Incoming
 * Webhook, generic HTTP webhook). The user pastes their own endpoint; the URL
 * (which embeds a secret token for Slack) is stored encrypted at the application
 * layer (AES-256-GCM), so `config_enc` is opaque TEXT here. `label` is a
 * non-sensitive display hint. One row per (user, provider) — enforced by a
 * unique index. RLS scopes rows to their owner. Migration owned here (NestJS =
 * owner of métier tables).
 */
export class Integrations1784200000000 implements MigrationInterface {
  public name = 'Integrations1784200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        config_enc TEXT NOT NULL,
        label TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS integrations_user_provider_uidx
        ON integrations (user_id, provider)
    `)

    await queryRunner.query(`ALTER TABLE integrations ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE POLICY "Users can manage their own integrations"
        ON integrations
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
