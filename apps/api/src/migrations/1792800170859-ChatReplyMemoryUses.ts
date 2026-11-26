import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1916.18 / #1916.24 — LA TRACE, RÉPONSE PAR RÉPONSE, DES ÉLÉMENTS DE MÉMOIRE
 * ENVOYÉS À LAURA.
 *
 * Décision de Louis du 13/09/2026 : tracer MAINTENANT quels éléments de mémoire
 * étaient dans le contexte d'une réponse, et le montrer sous la réponse et dans
 * Réglages › Mémoire de Laura.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ENVOYÉ, PAS « UTILISÉ »
 * ─────────────────────────────────────────────────────────────────────────────
 * Une ligne dit qu'un élément est PARTI dans le prompt d'un tour — après la
 * portée, l'échéance et la borne du prompt (`memoryItemsSentToModel`). Elle ne
 * dit pas que le modèle s'en est servi, et aucun écran ne le prétend.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DES IDENTIFIANTS, JAMAIS UN CONTENU
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune colonne ne recopie le texte d'un élément ni celui d'une réponse. Le
 * texte affiché est relu sur l'élément vivant, avec la règle de portée du
 * lecteur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CINQ CLÉS, CINQ DÉCISIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * · `workspace_id` NOT NULL, CASCADE — la trace ne sort pas de son espace.
 * · `user_id` NOT NULL, CASCADE — qui a posé la question ; « Tout oublier » et
 *   l'effacement de compte suppriment ses traces (et le compte supprimé les
 *   emporte de toute façon).
 * · `turn_id` — émis par l'API. La réponse du chat est enregistrée APRÈS le
 *   flux, par le web : le tour voyage dans l'événement terminal et rattache
 *   ses lignes au message (`message_id`). Un tour jamais rattaché n'est compté
 *   nulle part et se purge au tour suivant de la même personne.
 * · `message_id` NULL, CASCADE — une conversation supprimée emporte ses traces.
 *   `null` : réponse d'un assistant externe (`ask_bellum`, pas un fil), ou tour
 *   pas encore rattaché.
 * · `fact_id` NULL, SET NULL — un élément supprimé emporte son LIEN : la trace
 *   ne désigne plus rien, et la réponse dit « 1 élément retiré depuis » au lieu
 *   de prétendre avoir eu un élément de moins.
 *
 * RLS activée SANS politique : seule l'API (rôle de service) écrit et relit.
 *
 * Porte « ajout seulement » : une table neuve, aucune table existante touchée.
 * Le `CHECK` est posé dès la création, sous garde de ré-exécution — la
 * contrainte précède le code qui écrit la valeur (GA-11 / GA-12).
 */
export class ChatReplyMemoryUses1792800170859 implements MigrationInterface {
  public name = 'ChatReplyMemoryUses1792800170859'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_reply_memory_uses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        turn_id uuid NOT NULL,
        surface text NOT NULL,
        message_id uuid NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
        fact_id uuid NULL REFERENCES memory_pinned_facts(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chat_reply_memory_uses_surface_check'
        ) THEN
          ALTER TABLE chat_reply_memory_uses
            ADD CONSTRAINT chat_reply_memory_uses_surface_check
            CHECK (surface IN ('chat', 'externalAssistant'));
        END IF;
      END $$;
    `)

    // Sous une réponse (et le compte par message à la lecture d'un fil).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS chat_reply_memory_uses_message_idx ON chat_reply_memory_uses (message_id)
    `)
    // Le rattachement d'un tour à sa réponse enregistrée.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS chat_reply_memory_uses_turn_idx ON chat_reply_memory_uses (turn_id)
    `)
    // « Consulté dans N réponses, la dernière le … » dans Réglages › Mémoire.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS chat_reply_memory_uses_fact_idx ON chat_reply_memory_uses (fact_id, created_at)
    `)
    // « Tout oublier », l'effacement de compte, la purge des tours non rattachés.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS chat_reply_memory_uses_user_idx ON chat_reply_memory_uses (user_id)
    `)

    await queryRunner.query(`ALTER TABLE chat_reply_memory_uses ENABLE ROW LEVEL SECURITY`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
