import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2075.14 (épopée #2880, lot V33) — « Valider par BLOC » : le geste
 * `validated` rejoint `comment`/`refused` sur `commercial_audit_feedback`.
 * Élargie AVANT le code qui l'écrit (GA-11/GA-12) ; le texte reste interdit
 * hors commentaire (une validation ne porte pas de texte, comme un refus).
 */
export class CommercialAuditFeedbackValidated1796350797411 implements MigrationInterface {
  public name = 'CommercialAuditFeedbackValidated1796350797411'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE commercial_audit_feedback DROP CONSTRAINT IF EXISTS commercial_audit_feedback_kind_check;
      ALTER TABLE commercial_audit_feedback ADD CONSTRAINT commercial_audit_feedback_kind_check
        CHECK (kind IN ('comment', 'refused', 'validated'));
      ALTER TABLE commercial_audit_feedback DROP CONSTRAINT IF EXISTS commercial_audit_feedback_comment_text_check;
      ALTER TABLE commercial_audit_feedback ADD CONSTRAINT commercial_audit_feedback_comment_text_check
        CHECK ((kind = 'comment' AND comment_text IS NOT NULL AND btrim(comment_text) <> '')
            OR (kind IN ('refused', 'validated') AND comment_text IS NULL));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM commercial_audit_feedback WHERE kind = 'validated';
      ALTER TABLE commercial_audit_feedback DROP CONSTRAINT IF EXISTS commercial_audit_feedback_comment_text_check;
      ALTER TABLE commercial_audit_feedback ADD CONSTRAINT commercial_audit_feedback_comment_text_check
        CHECK ((kind = 'comment' AND comment_text IS NOT NULL AND btrim(comment_text) <> '')
            OR (kind = 'refused' AND comment_text IS NULL));
      ALTER TABLE commercial_audit_feedback DROP CONSTRAINT IF EXISTS commercial_audit_feedback_kind_check;
      ALTER TABLE commercial_audit_feedback ADD CONSTRAINT commercial_audit_feedback_kind_check
        CHECK (kind IN ('comment', 'refused'));
    `)
  }
}
