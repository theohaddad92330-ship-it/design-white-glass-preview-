import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2327 — LAU-FINAL-068 : la résolution d'identité des talents.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA MIGRATION POSE, AVANT LE CODE QUI L'ÉCRIT (GA-11 / GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 *  · `consultant_documents.content_sha256` (#2327.9 / #2327.16) — l'empreinte
 *    du FICHIER déposé. Le même CV sous deux noms se reconnaît sans relire son
 *    texte ; on ne garde toujours pas le binaire.
 *  · `consultant_documents.experience_keys` (#2327.7 / #2327.15) — les lignes
 *    d'expérience (employeur + période) lues par `readExperienceKeys`. Stockées
 *    au dépôt : relire cinq mille CV à chaque comparaison n'est pas une option.
 *  · `consultant_documents.archived_at` (#2327.22) — « aucun document source
 *    n'est supprimé » : retirer un document l'ARCHIVE.
 *  · `record_field_audit.rule` (#2327.21) — la RÈGLE qui a produit l'écriture,
 *    à côté de l'ancienne valeur, de la nouvelle, de la source, de l'auteur et
 *    de la date. `NULL` pour tout l'historique d'avant : on ne la devine pas.
 *  · `talent_identity_decisions` (#2327.12 / #2327.18 / #2327.20 / #2327.25) —
 *    ce qu'un humain a décidé d'une paire : « pas la même personne » (mémorisé),
 *    « mettre à jour », « ignorer », « attribuer ». L'annulation DATE la ligne,
 *    elle ne l'efface pas.
 *
 * ⚠️ Aucune colonne de CONFIANCE n'est persistée (`no-persisted-probability`) :
 * la décision garde la RÈGLE (`reason`), jamais un nombre.
 *
 * ⚠️ `action` ne contient PAS `merge` : `c37_fusion_doublons` tient. Si Louis
 * la lève, la valeur s'ajoute ici AVANT le code (GA-11).
 *
 * Porte « ajout seulement » : colonnes nullables ou à défaut, une table neuve,
 * aucune contrainte existante resserrée.
 */
export class TalentIdentityResolution1795330000001 implements MigrationInterface {
  public name = 'TalentIdentityResolution1795330000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultant_documents ADD COLUMN IF NOT EXISTS content_sha256 text`)
    await queryRunner.query(
      `ALTER TABLE consultant_documents ADD COLUMN IF NOT EXISTS experience_keys text[] NOT NULL DEFAULT '{}'`,
    )
    await queryRunner.query(`ALTER TABLE consultant_documents ADD COLUMN IF NOT EXISTS archived_at timestamptz`)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS consultant_documents_sha256_idx
        ON consultant_documents (workspace_id, content_sha256)
        WHERE content_sha256 IS NOT NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS consultant_documents_experience_keys_idx
        ON consultant_documents USING gin (experience_keys)
    `)

    await queryRunner.query(`ALTER TABLE record_field_audit ADD COLUMN IF NOT EXISTS rule text`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS talent_identity_decisions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        talent_id uuid NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
        other_talent_id uuid REFERENCES consultants(id) ON DELETE CASCADE,
        action text NOT NULL,
        state text NOT NULL,
        reason text,
        assignee_id uuid,
        decided_by uuid NOT NULL,
        document_ids uuid[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        undone_at timestamptz,
        undone_by uuid
      )
    `)
    await queryRunner.query(`
      ALTER TABLE talent_identity_decisions
        DROP CONSTRAINT IF EXISTS talent_identity_decisions_action_check,
        ADD CONSTRAINT talent_identity_decisions_action_check
          CHECK (action IN ('keep_separate', 'update_existing', 'ignore', 'assign_to_recruiter'))
    `)
    await queryRunner.query(`
      ALTER TABLE talent_identity_decisions
        DROP CONSTRAINT IF EXISTS talent_identity_decisions_state_check,
        ADD CONSTRAINT talent_identity_decisions_state_check
          CHECK (state IN ('resolved', 'probable_duplicate', 'ambiguous', 'new', 'updated', 'conflicting', 'ignored'))
    `)
    await queryRunner.query(`
      ALTER TABLE talent_identity_decisions
        DROP CONSTRAINT IF EXISTS talent_identity_decisions_reason_check,
        ADD CONSTRAINT talent_identity_decisions_reason_check
          CHECK (reason IS NULL OR reason IN ('same_email', 'same_phone', 'same_name_same_employer', 'same_name', 'same_external_id', 'same_public_profile', 'same_document', 'same_name_same_employer_period', 'same_name_same_location', 'same_experiences'))
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS talent_identity_decisions_talent_idx
        ON talent_identity_decisions (workspace_id, talent_id)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS talent_identity_decisions_other_idx
        ON talent_identity_decisions (workspace_id, other_talent_id)
    `)
    await queryRunner.query(`ALTER TABLE talent_identity_decisions ENABLE ROW LEVEL SECURITY`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
