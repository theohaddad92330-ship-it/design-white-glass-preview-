import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3086 — PRÉSENCE SUR UN FIL DE LAURA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CONSTAT
 * ─────────────────────────────────────────────────────────────────────────────
 * Apricot Labs (deux sièges, un même espace) : « afficher si une personne est
 * sur une conversation ». Aucune notion de présence n'existait
 * (`apps/web/src/features/chat`, `apps/api/src/modules/ia-proxy` — vérifié par
 * `git grep presence|typing`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TABLE NEUVE, ÉPHÉMÈRE PAR CONSTRUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 * `thread_key` remplace la paire `(account_id, conversation_id)` par UNE colonne
 * TEXT non nullable : Postgres ne traite jamais deux `NULL` comme égaux dans un
 * index unique, et le fil PAR DÉFAUT porte justement les deux à `NULL`
 * (`chat-messages.service.ts`, `threadWhere`) — un upsert par
 * `ON CONFLICT (workspace_id, thread_key, user_id)` n'aurait alors jamais
 * retrouvé sa propre ligne. `ChatPresenceService` calcule cette clé
 * (`accountId ?? '·'` + `:` + `conversationId ?? '·'`), jamais le navigateur.
 *
 * Aucune donnée de personne durable : une ligne n'est qu'un battement de coeur
 * (`updated_at`), lu avec une fenêtre glissante côté service — elle n'a donc
 * jamais besoin d'être « corrigée » ni conservée. C'est aussi pourquoi elle
 * n'entre PAS dans `chat_messages` ni dans une nouvelle colonne dessus : une
 * présence n'est pas un message, et scoper l'upsert sur le fil (pas sur un
 * message précis) est ce qui la rend triviale à faire disparaître (TTL).
 *
 * Scopée par `workspace_id`, RLS lue par les membres de l'espace — même garde
 * que `chat_conversations` (#2430). Rejouable (`IF NOT EXISTS`, politique
 * gardée).
 */
export class ChatPresence1796321990410 implements MigrationInterface {
  name = 'ChatPresence1796321990410'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_presence (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        thread_key text NOT NULL,
        user_id uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS chat_presence_member_unique
      ON chat_presence (workspace_id, thread_key, user_id)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS chat_presence_thread_idx
      ON chat_presence (workspace_id, thread_key, updated_at)
    `)
    await queryRunner.query(`ALTER TABLE chat_presence ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE POLICY chat_presence_member_read ON chat_presence FOR SELECT
          USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS chat_presence`)
  }
}
