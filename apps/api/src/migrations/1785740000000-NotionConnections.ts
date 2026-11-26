import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `notion_connections` — a team's OAuth link to a Notion workspace, used to
 * ingest pages/databases into the RAG store. The access token is stored
 * encrypted at the application layer (AES-256-GCM), so the column is opaque TEXT
 * here. One connection per workspace — enforced by a unique index. RLS scopes
 * rows to their owner. Migration owned here (NestJS = owner of métier tables).
 */
export class NotionConnections1785740000000 implements MigrationInterface {
  public name = 'NotionConnections1785740000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notion_connections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        workspace_id UUID NOT NULL,
        notion_workspace_id TEXT,
        workspace_name TEXT,
        bot_id TEXT,
        access_token_enc TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS notion_connections_workspace_uidx
        ON notion_connections (workspace_id)
    `)

    await queryRunner.query(`ALTER TABLE notion_connections ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE POLICY "Users can manage their own Notion connections"
        ON notion_connections
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
