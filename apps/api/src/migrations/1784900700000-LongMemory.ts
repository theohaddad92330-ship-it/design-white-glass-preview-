import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * "Long memory" for the copilot (Théo P2: résumé par conversation, préférences,
 * faits épinglés). Three durable stores so the chat carries memory across
 * sessions:
 *
 * - `memory_pinned_facts` — user-pinned facts (workspace read scope, optional
 *   account scope).
 * - `user_preferences` — one JSONB preferences bag per user (`user_id` unique).
 * - `conversation_summaries` — a rolling per-conversation summary. There is no
 *   `conversations` table (a conversation is a grouping of `chat_messages` by
 *   `conversation_id`); the summary lives here as one row per conversation,
 *   keyed by `(workspace_id, conversation_id)` — `conversation_id` is TEXT so it
 *   tolerates the web's synthetic thread keys ("general", "account-<uuid>").
 *
 * RLS scopes every row to its owner (`auth.uid() = user_id`), consistent with
 * the other métier tables; the API additionally scopes reads by workspace. The
 * `CREATE POLICY` blocks are guarded (no `IF NOT EXISTS` in Postgres) so a
 * re-run — a partial prior apply, or two release instances racing
 * `migration:run` — does not crash with 42710.
 */
export class LongMemory1784900700000 implements MigrationInterface {
  public name = 'LongMemory1784900700000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── memory_pinned_facts ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS memory_pinned_facts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
        account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
        fact TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS memory_pinned_facts_scope_idx
        ON memory_pinned_facts (workspace_id, account_id, created_at)
    `)
    await queryRunner.query(`ALTER TABLE memory_pinned_facts ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'memory_pinned_facts'
            AND policyname = 'Users can manage their own pinned facts'
        ) THEN
          CREATE POLICY "Users can manage their own pinned facts"
            ON memory_pinned_facts
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
        END IF;
      END $$;
    `)

    // ── user_preferences ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
        preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'user_preferences'
            AND policyname = 'Users can manage their own preferences'
        ) THEN
          CREATE POLICY "Users can manage their own preferences"
            ON user_preferences
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
        END IF;
      END $$;
    `)

    // ── conversation_summaries ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS conversation_summaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
        account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
        conversation_id TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    // One rolling summary per (workspace, conversation) — the upsert key.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS conversation_summaries_scope_uidx
        ON conversation_summaries (workspace_id, conversation_id)
    `)
    await queryRunner.query(`ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'conversation_summaries'
            AND policyname = 'Users can manage their own conversation summaries'
        ) THEN
          CREATE POLICY "Users can manage their own conversation summaries"
            ON conversation_summaries
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
        END IF;
      END $$;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
