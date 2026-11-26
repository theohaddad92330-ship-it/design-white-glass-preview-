import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2444.1 (suite) — LE MOTIF DE « PAS PERTINENT » ÉLARGI, 7 → 12.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * RÉFUTÉ en prod (sha 4a4e9e07d) : le retour « Pas pertinent » n'offrait que
 * 6 verdicts + 7 sous-motifs = 13 catégories au total, quand la demande de
 * l'issue est « au moins 15 catégories de feedback ». La taxonomie GÉNÉRIQUE
 * de 16 types (`REPLY_FEEDBACK_CATEGORIES`, migration `1795999802722`) reste
 * un axe INDÉPENDANT sous « Autre » (tranché par Louis 22/09 soir §1) — elle
 * ne touche pas ce couplage-ci, et ne le remplace pas.
 *
 * `REPLY_FEEDBACK_REASONS` (`packages/contracts/src/schemas/reply-feedback.ts`)
 * passe de 7 à 12 : cinq motifs NOMMÉS, distincts des sept existants et des
 * seize catégories de l'axe « Autre » (aucun chevauchement de token) —
 * `doublon`, `source_douteuse`, `contact_parti`, `concurrent_en_place`,
 * `budget_insuffisant`. Total : 6 verdicts + 12 motifs = 18 ≥ 15.
 *
 * La contrainte CHECK est élargie AVANT le code qui écrit la valeur (GA-11/GA-12) —
 * ajoutés EN FIN de liste, jamais insérés au milieu (GA-08).
 */
export class ChatReplyFeedbackReasonsExpanded1795999868273 implements MigrationInterface {
  public name = 'ChatReplyFeedbackReasonsExpanded1795999868273'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE chat_reply_feedback DROP CONSTRAINT IF EXISTS chat_reply_feedback_reason_check`,
    )
    await queryRunner.query(`
      ALTER TABLE chat_reply_feedback ADD CONSTRAINT chat_reply_feedback_reason_check
        CHECK (reason IS NULL OR reason IN (
          'mauvais_compte', 'mauvais_contact', 'mauvais_timing', 'hors_positionnement', 'deja_traite', 'autre', 'trop_long',
          'doublon', 'source_douteuse', 'contact_parti', 'concurrent_en_place', 'budget_insuffisant'
        ))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE chat_reply_feedback DROP CONSTRAINT IF EXISTS chat_reply_feedback_reason_check`,
    )
    await queryRunner.query(`
      ALTER TABLE chat_reply_feedback ADD CONSTRAINT chat_reply_feedback_reason_check
        CHECK (reason IS NULL OR reason IN (
          'mauvais_compte', 'mauvais_contact', 'mauvais_timing', 'hors_positionnement', 'deja_traite', 'autre', 'trop_long'
        ))
    `)
  }
}
