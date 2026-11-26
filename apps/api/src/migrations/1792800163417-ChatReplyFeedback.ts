import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1919 — les retours d'une personne sur les réponses de Laura.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AJOUT SEULEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Une table neuve, rien d'autre : aucune colonne existante n'est touchée, aucun
 * code déjà en production ne la lit. Rejouable (`IF NOT EXISTS`, garde
 * `pg_policies`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES CONTRAINTES AVANT LE CODE QUI ÉCRIT (GA-11 / GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 * Les quatre `CHECK` sont NOMMÉS (GA-177) et posés avec la table, donc avant le
 * premier `save` : `verdict` ⊇ `REPLY_FEEDBACK_VERDICTS`, `reason` ⊇
 * `REPLY_FEEDBACK_REASONS`, `correction_scope` ⊇
 * `REPLY_FEEDBACK_CORRECTION_SCOPES`, `reuse_scope` ⊇ `FEEDBACK_REUSE_SCOPES`
 * (GA-47 — une table de retour porte sa portée, fermée par défaut).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LES CLÉS ÉTRANGÈRES DISENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  · l'espace supprimé emporte ses retours (CASCADE), comme `account_feedback` ;
 *  · un compte ou un contact supprimé (RGPD) emporte les retours qui le visaient
 *    (CASCADE) — une précision libre peut le nommer ;
 *  · un message supprimé avec son fil (#1120) laisse le retour, relié par son
 *    empreinte (SET NULL) : c'est la mémoire de la personne, qu'elle peut
 *    retirer elle-même ;
 *  · la correction de dossier supprimée laisse le retour personnel (SET NULL).
 *
 * RLS avec la politique standard `auth.uid() = user_id` ; l'API service-role
 * cloisonne en plus par espace ET auteur.
 */
export class ChatReplyFeedback1792800163417 implements MigrationInterface {
  public name = 'ChatReplyFeedback1792800163417'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_reply_feedback (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id uuid NOT NULL,
        reply_digest text NOT NULL,
        message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
        account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
        contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
        action_kind text,
        verdict text NOT NULL,
        reason text,
        note text,
        correction_field text,
        correction_value text,
        correction_scope text,
        account_feedback_id uuid REFERENCES account_feedback(id) ON DELETE SET NULL,
        reuse_scope text NOT NULL DEFAULT 'tenant_private',
        withdrawn_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chat_reply_feedback_verdict_check CHECK (verdict IN ('utile', 'pas_pertinent', 'donnee_fausse', 'deja_fait', 'pas_maintenant', 'mauvaise_priorite')),
        CONSTRAINT chat_reply_feedback_reason_check CHECK (reason IS NULL OR reason IN ('mauvais_compte', 'mauvais_contact', 'mauvais_timing', 'hors_positionnement', 'deja_traite', 'autre', 'trop_long')),
        CONSTRAINT chat_reply_feedback_correction_scope_check CHECK (correction_scope IS NULL OR correction_scope IN ('reply', 'account')),
        CONSTRAINT chat_reply_feedback_reuse_scope_check CHECK (reuse_scope IN ('tenant_private', 'generalized_only'))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS chat_reply_feedback_person_idx ON chat_reply_feedback (workspace_id, user_id, created_at)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS chat_reply_feedback_digest_idx ON chat_reply_feedback (workspace_id, reply_digest)`,
    )
    await queryRunner.query(`ALTER TABLE chat_reply_feedback ENABLE ROW LEVEL SECURITY`)
    // Postgres n'a pas CREATE POLICY IF NOT EXISTS — garde `pg_policies`, même
    // motif que `account_feedback`.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_reply_feedback'
                         AND policyname = 'Users can manage their own reply feedback') THEN
          CREATE POLICY "Users can manage their own reply feedback"
            ON chat_reply_feedback FOR ALL
            USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
        END IF;
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS chat_reply_feedback`)
  }
}
