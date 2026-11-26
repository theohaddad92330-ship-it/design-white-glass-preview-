import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2439.13 — LA CONSERVATION LÉGALE PEUT PORTER UNE DATE DE REVUE.
 *
 * `legal_hold_at` / `legal_hold_by` / `legal_hold_reason` disent QUAND, QUI et
 * POURQUOI ; rien ne disait COMBIEN DE TEMPS. La durée réelle d'une
 * conservation dépend du litige ou de l'obligation qui la motive — une
 * décision que seul le gérant qui la pose connaît, jamais une durée que
 * Bellum inventerait. Cette colonne accueille donc une date DÉCLARÉE,
 * optionnelle : `NULL` garde le comportement d'avant (la conservation dure
 * jusqu'à la levée manuelle).
 *
 * Nullable comme ses trois voisines, même table.
 */
export class ChatConversationLegalHoldReviewBy1796322750100 implements MigrationInterface {
  public name = 'ChatConversationLegalHoldReviewBy1796322750100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_conversations
      ADD COLUMN IF NOT EXISTS legal_hold_review_by timestamptz
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_conversations
      DROP COLUMN IF EXISTS legal_hold_review_by
    `)
  }
}
