import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `chat_messages` — mémoire continue du chatbot (Théo #7). One row per turn
 * (user / assistant) keyed by (user_id, account_id), so a conversation survives
 * across sessions and the advisor has continuous memory instead of relying on the
 * client to resend history. The IA reads/writes it via Supabase (browser-facing
 * chat router); migration owned here (NestJS = owner of métier tables).
 */
export class ChatMessages1783600000000 implements MigrationInterface {
  public name = 'ChatMessages1783600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `)

    await queryRunner.query(`ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE POLICY "Users can manage their own chat messages"
        ON chat_messages
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    `)

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS chat_messages_thread_idx ON chat_messages (user_id, account_id, created_at)`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
