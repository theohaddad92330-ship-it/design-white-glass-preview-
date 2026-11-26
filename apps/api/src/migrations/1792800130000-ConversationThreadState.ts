import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1927.10 — l'ÉTAT STRUCTURÉ du fil vit avec le résumé de la conversation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * La seule mémoire d'un fil de Laura était `conversation_summaries.summary` :
 * deux extraits de 200 caractères par échange, 2 000 au total
 * (`memory.service.ts::nextSummary`). Rouvrir un fil ancien rendait donc
 * quelques phrases tronquées — ni les objets cités, ni la recherche préparée,
 * ni les actions préparées, ni les questions déjà posées.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION FAIT — ADDITIF
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. `thread_state jsonb` NULLABLE, sans défaut : une instruction de
 *     métadonnées, aucune réécriture de table. Toutes les lignes existantes
 *     valent NULL — « aucun état connu », exactement ce que le code lisait
 *     avant (`MemoryService.getConversationThreadState` rend `null`).
 *  2. `conversation_summaries_thread_state_check` — la contrainte AVANT le code
 *     qui écrit (GA-11/GA-12) : un objet JSON, jamais un tableau ni un scalaire,
 *     et au plus 32 000 octets. Le service IA borne un état rempli à chaque
 *     plafond sous 16 Ko (`test_the_worst_case_state_stays_small`), le schéma
 *     zod `conversationThreadStateSchema` refuse tout ce qui dépasse ses bornes :
 *     la contrainte est le filet de dernier recours, deux fois plus large.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORTÉE — PERSONNELLE, COMME LA LIGNE QUI LA PORTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La colonne hérite de la clé de la ligne `(user_id, workspace_id,
 * conversation_id)` et de sa RLS (`auth.uid() = user_id`) : l'état d'un fil est
 * dérivé en silence de ce qu'une PERSONNE a demandé, il ne traverse pas les
 * sièges (D65). Tout ce qui efface la ligne l'efface avec elle : « oublier ce
 * fil » et « tout oublier » (Réglages › Mémoire de Laura), la purge des lignes
 * archivées (`privacy-retention.service.ts`), l'effacement d'un compte, et —
 * nouveau avec #1927 — la suppression du fil (`POST /ia/chat/threads/delete`).
 *
 * Idempotent : `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` puis
 * `ADD CONSTRAINT`. `down` non supporté (convention du dépôt).
 */
export class ConversationThreadState1792800130000 implements MigrationInterface {
  public name = 'ConversationThreadState1792800130000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE conversation_summaries ADD COLUMN IF NOT EXISTS thread_state jsonb`)

    await queryRunner.query(
      `ALTER TABLE conversation_summaries DROP CONSTRAINT IF EXISTS conversation_summaries_thread_state_check`,
    )
    await queryRunner.query(`
      ALTER TABLE conversation_summaries
        ADD CONSTRAINT conversation_summaries_thread_state_check
        CHECK (
          thread_state IS NULL
          OR (jsonb_typeof(thread_state) = 'object' AND octet_length(thread_state::text) <= 32000)
        )
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
