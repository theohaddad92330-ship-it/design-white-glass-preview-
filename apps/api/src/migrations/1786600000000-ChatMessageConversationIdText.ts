import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `chat_messages.conversation_id` : UUID → TEXT.
 *
 * Le copilote avait DEUX espaces de noms de conversation incompatibles :
 * - `/ia/chat` (mémoire longue) accepte la clé synthétique du web
 *   (« general », « account-<uuid> ») — et `conversation_summaries
 *   .conversation_id` est déjà en TEXT, explicitement « so it can hold the
 *   web's synthetic ids » (migration LongMemory 1784900700000) ;
 * - `/ia/chat/messages` (persistance) exigeait un UUID.
 *
 * Résultat : le Copilote IA (`/chat`) ne pouvait pas persister ses fils, et
 * seul le widget flottant — qui tire un `crypto.randomUUID()` — savait écrire.
 * On aligne la persistance sur la clé de fil déjà canonique côté mémoire longue.
 *
 * Élargissement SANS PERTE : tout UUID se sérialise en texte, donc les lignes
 * déjà écrites par le widget gardent exactement la même valeur (forme canonique
 * minuscule) et restent lisibles par les mêmes requêtes. Les conversations en
 * cours ne cassent pas.
 *
 * L'index `chat_messages_conversation_idx` est reconstruit par le changement de
 * type ; on le recrée explicitement au cas où il aurait été supprimé.
 */
export class ChatMessageConversationIdText1786600000000 implements MigrationInterface {
  public name = 'ChatMessageConversationIdText1786600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotent : ne rien faire si la colonne est déjà en TEXT (re-run, ou base
    // provisionnée après ce changement).
    const [column] = await queryRunner.query(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_name = 'chat_messages' AND column_name = 'conversation_id'
    `)
    if (!column || column.data_type === 'text') return

    await queryRunner.query(`
      ALTER TABLE chat_messages
      ALTER COLUMN conversation_id TYPE TEXT USING conversation_id::TEXT
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx
      ON chat_messages (user_id, conversation_id, created_at)
    `)
  }

  public async down(): Promise<void> {
    // Convention du repo — et ici la descente serait DESTRUCTRICE : une fois des
    // clés synthétiques écrites (« general »), le retour en UUID les rejette.
    throw new Error('down migrations are not supported')
  }
}
