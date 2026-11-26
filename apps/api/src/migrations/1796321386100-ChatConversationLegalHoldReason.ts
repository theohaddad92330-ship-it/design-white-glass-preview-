import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2439.13 — LA CONSERVATION LÉGALE DIT ENFIN POURQUOI.
 *
 * `chat_conversations.legal_hold_at` / `legal_hold_by` (migration
 * `1795999431572-ChatConversations`) posent QUAND et QUI, jamais POURQUOI —
 * exactement le premier manque nommé par #2439.13 (« si une donnée ne peut pas
 * être supprimée immédiatement : expliquer pourquoi »). Une conservation posée
 * sans raison écrite est un blocage muet : personne ne peut la contester ni la
 * comprendre plus tard, gérant compris.
 *
 * Nullable comme ses deux voisines : une conversation JAMAIS mise sous
 * conservation garde `NULL` partout, exactement le même défaut.
 */
export class ChatConversationLegalHoldReason1796321386100 implements MigrationInterface {
  public name = 'ChatConversationLegalHoldReason1796321386100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_conversations
      ADD COLUMN IF NOT EXISTS legal_hold_reason text
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_conversations
      DROP COLUMN IF EXISTS legal_hold_reason
    `)
  }
}
