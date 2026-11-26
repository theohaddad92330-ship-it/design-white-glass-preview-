import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2444.1 — LA TAXONOMIE DE FEEDBACK, SANS CASSER LE COUPLAGE EXISTANT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * La liste de 16 types de l'issue #2444 mélange verdict (« faux » existe déjà
 * comme `donnee_fausse`), motif de rejet (`reason`, couplé à
 * `verdict=pas_pertinent`) et des catégories qui n'en sont pas (bug interface,
 * lenteur, coût inattendu, ton…). Réutiliser `reason` casserait le superRefine
 * qui l'exige couplé au verdict « Pas pertinent ».
 *
 * `category` est un axe INDÉPENDANT, additif — `REPLY_FEEDBACK_CATEGORIES`
 * (`packages/contracts/src/schemas/reply-feedback.ts`). Additive seulement :
 * aucune colonne existante n'est touchée, NULL par défaut (aucune catégorie).
 * Tranché par Louis 22/09 soir (decisions-louis-22-09-soir.md §1).
 */
export class ChatReplyFeedbackCategory1795999802722 implements MigrationInterface {
  public name = 'ChatReplyFeedbackCategory1795999802722'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE chat_reply_feedback ADD COLUMN IF NOT EXISTS category text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE chat_reply_feedback DROP COLUMN IF EXISTS category`)
  }
}
