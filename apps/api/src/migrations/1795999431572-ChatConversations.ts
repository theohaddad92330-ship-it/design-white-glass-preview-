import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2430.2 / .4 / .10 / .11 / .12 — L'OBJET « CONVERSATION » DE LAURA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CONSTAT
 * ─────────────────────────────────────────────────────────────────────────────
 * Une conversation nommée n'était qu'une CLÉ (`chat_messages.conversation_id`)
 * et ses lignes : rien ne pouvait y porter un propriétaire, un fil d'origine,
 * un objet rattaché, une conservation légale ni des versions figées. Décision
 * de Louis (22/09/2026 soir, decisions §10) : un objet conversation de premier
 * niveau, qui ÉTEND les fils existants.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORTE « AJOUT SEULEMENT »
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux tables NEUVES, aucune colonne existante touchée, aucun message déplacé
 * ni réécrit. Une conversation SANS ligne ici garde exactement son comportement
 * d'avant : propriétaire = qui l'a ouverte, aucun parent, aucun objet, aucune
 * conservation légale, aucune version. La ligne s'écrit au premier geste qui a
 * besoin d'elle (brancher, transférer, rattacher, conserver, figer).
 *
 * Aucune contrainte d'énumération : aucune colonne ne porte de valeur fermée.
 * Toutes les colonnes de PERSONNE sont nullables dès la création : l'effacement
 * RGPD d'un compte retire le lien, jamais la conversation d'équipe (GA-129).
 *
 * Une VERSION n'est pas une copie : c'est une BORNE (`up_to_message_id`,
 * `up_to_at`) sur le même fil, lu par le même chemin (`listThread`). Le
 * docblock de `ShareConversation.tsx` refuse un second chemin de lecture pour
 * la même donnée — une borne n'en ouvre aucun.
 *
 * Scopées par `workspace_id` comme les messages qu'elles décrivent ; RLS lue
 * par les membres de l'espace. Rejouable (`IF NOT EXISTS`, politiques gardées).
 */
export class ChatConversations1795999431572 implements MigrationInterface {
  name = 'ChatConversations1795999431572'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        conversation_id text NOT NULL,
        -- #2430.12 — propriétaire DÉCLARÉ ; NULL = qui a ouvert le fil.
        owner_user_id uuid,
        -- #2430.2 — le fil d'origine d'une branche, et la réponse d'où elle part.
        parent_conversation_id text,
        branched_from_message_id uuid,
        -- #2430.12 — l'objet auquel la conversation est rattachée.
        attached_account_id uuid,
        -- #2430.10 — conservation légale : tant qu'elle court, le fil ne se retire pas.
        legal_hold_at timestamptz,
        legal_hold_by uuid,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_thread_unique
      ON chat_conversations (workspace_id, conversation_id)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS chat_conversations_parent_idx
      ON chat_conversations (workspace_id, parent_conversation_id)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_conversation_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        conversation_id text NOT NULL,
        version integer NOT NULL,
        -- #2430.4 — la BORNE : le dernier message que la version montre.
        up_to_message_id uuid NOT NULL,
        up_to_at timestamptz NOT NULL,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS chat_conversation_versions_unique
      ON chat_conversation_versions (workspace_id, conversation_id, version)
    `)

    for (const table of ['chat_conversations', 'chat_conversation_versions']) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE POLICY ${table}_member_read ON ${table} FOR SELECT
            USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS chat_conversation_versions`)
    await queryRunner.query(`DROP TABLE IF EXISTS chat_conversations`)
  }
}
