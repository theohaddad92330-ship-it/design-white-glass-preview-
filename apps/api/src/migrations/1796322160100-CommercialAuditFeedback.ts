import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2075.12 / #2075.13 (épopée #2774, « Audit interactif ») — commenter une
 * conclusion, refuser une recommandation : aucune brique n'existait pour
 * l'un ni l'autre (`team-comments` scope `account_id`/`conversation_id`,
 * jamais l'audit ONBOARDING visé ici — vérifié par les lots précédents).
 *
 * Journal APPEND-ONLY, même patron que `outreach_transitions` : on archive,
 * on ne supprime pas (doctrine) — une note plus récente sur la MÊME cible ne
 * remplace pas la précédente en base, elle s'ajoute par-dessus ; c'est la
 * LECTURE (`DISTINCT ON`) qui ne garde que la plus récente par cible.
 *
 * `target_key` est TEXT libre et pas un enum Postgres, même raison que
 * `routine_subscriptions.routine_key` : les clés de l'audit
 * (`AuditHeadlineKey`/`AuditColumnKey`, `build-audit.ts`) vivent dans le
 * CODE web, pas en base — en ajouter une ne doit jamais demander une
 * migration de plus.
 *
 * `comment_text` NOT NULL seulement pour `kind = 'comment'` (contrainte
 * `CHECK`, élargie AVANT le code qui l'écrit — GA-11/GA-12) : un refus ne
 * porte pas de texte, un commentaire ne peut pas en manquer.
 */
export class CommercialAuditFeedback1796322160100 implements MigrationInterface {
  public name = 'CommercialAuditFeedback1796322160100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS commercial_audit_feedback (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        user_id uuid NOT NULL,
        target_key text NOT NULL,
        kind text NOT NULL,
        comment_text text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT commercial_audit_feedback_kind_check
          CHECK (kind IN ('comment', 'refused')),
        CONSTRAINT commercial_audit_feedback_comment_text_check
          CHECK ((kind = 'comment' AND comment_text IS NOT NULL AND btrim(comment_text) <> '')
              OR (kind = 'refused' AND comment_text IS NULL))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_commercial_audit_feedback_user_target
        ON commercial_audit_feedback (user_id, target_key, created_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS commercial_audit_feedback`)
  }
}
