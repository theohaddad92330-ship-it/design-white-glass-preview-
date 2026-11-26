import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4158.30 — contenu partagé avec l'équipe / personnel.
 *
 * `visibility` : `team` (partagé, visible de l'espace — c'est le comportement d'AVANT, donc le DÉFAUT :
 * aucune ligne existante ne change de visibilité) ou `personal` (visible de son seul auteur). CHECK posé
 * avec la colonne (GA-11 / GA-12).
 *
 * `sequence_templates` n'avait ni auteur ni date de mise à jour : `created_by` (NULL sur l'existant —
 * un modèle déjà là reste partagé, sans propriétaire inventé) et `updated_at` (NULL sur l'existant).
 *
 * AJOUT SEULEMENT.
 */
export class SharedContentVisibility1796530275187 implements MigrationInterface {
  name = 'SharedContentVisibility1796530275187'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sequence_templates
        ADD COLUMN IF NOT EXISTS created_by uuid,
        ADD COLUMN IF NOT EXISTS updated_at timestamptz,
        ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'team'
    `)
    await queryRunner.query(`
      ALTER TABLE sequence_templates
        DROP CONSTRAINT IF EXISTS sequence_templates_visibility_check,
        ADD CONSTRAINT sequence_templates_visibility_check CHECK (visibility IN ('team', 'personal'))
    `)
    await queryRunner.query(`
      ALTER TABLE message_library_entries
        ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'team'
    `)
    await queryRunner.query(`
      ALTER TABLE message_library_entries
        DROP CONSTRAINT IF EXISTS message_library_entries_visibility_check,
        ADD CONSTRAINT message_library_entries_visibility_check CHECK (visibility IN ('team', 'personal'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE message_library_entries DROP CONSTRAINT IF EXISTS message_library_entries_visibility_check`,
    )
    await queryRunner.query(`ALTER TABLE message_library_entries DROP COLUMN IF EXISTS visibility`)
    await queryRunner.query(
      `ALTER TABLE sequence_templates DROP CONSTRAINT IF EXISTS sequence_templates_visibility_check`,
    )
    await queryRunner.query(`
      ALTER TABLE sequence_templates
        DROP COLUMN IF EXISTS visibility,
        DROP COLUMN IF EXISTS updated_at,
        DROP COLUMN IF EXISTS created_by
    `)
  }
}
