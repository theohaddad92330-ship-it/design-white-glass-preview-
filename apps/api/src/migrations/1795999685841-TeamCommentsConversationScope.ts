import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1940.6 — commenter un FIL ou une RÉPONSE précise, pas seulement un compte.
 *
 * `team_comments` (`1788230518044-TeamComments`) portait déjà un fil partagé à
 * l'échelle du workspace, optionnellement rattaché à un compte. Cette
 * migration l'ÉTEND, additive et nullable : `conversation_id` (même type
 * `text` que `chat_messages.conversation_id` — une conversation par défaut
 * n'a pas de ligne `chat_conversations`, donc pas de FK possible) cible un
 * fil ; `message_id`, quand renseigné, cible UNE réponse précise de ce fil.
 * `NULL` sur les deux = comportement d'avant, inchangé : un commentaire
 * général au cockpit (§10).
 */
export class TeamCommentsConversationScope1795999685841 implements MigrationInterface {
  public name = 'TeamCommentsConversationScope1795999685841'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE team_comments ADD COLUMN IF NOT EXISTS conversation_id text;
    `)
    await queryRunner.query(`
      ALTER TABLE team_comments
        ADD COLUMN IF NOT EXISTS message_id uuid REFERENCES chat_messages(id) ON DELETE CASCADE;
    `)

    // Lecture d'un fil, ordre de lecture (le plus ancien d'abord), scopée espace.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS team_comments_conversation_idx
        ON team_comments (workspace_id, conversation_id, created_at)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
