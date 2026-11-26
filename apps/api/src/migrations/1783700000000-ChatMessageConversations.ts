import { MigrationInterface, QueryRunner } from 'typeorm'

export class ChatMessageConversations1783700000000 implements MigrationInterface {
  public name = 'ChatMessageConversations1783700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS conversation_id UUID
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx
      ON chat_messages (user_id, conversation_id, created_at)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
