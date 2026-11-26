import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4158.31 — le HANDOFF d'une action et les fils d'équipe « résolus ».
 *
 * - `action_plan_items.handoff_note` / `handoff_by` : la note de contexte qu'on
 *   écrit en déléguant une action à un collègue (obligatoire à la délégation,
 *   vérifiée côté service) et QUI l'a écrite. NULLABLES, sans défaut : une ligne
 *   déjà déléguée n'a pas de note, et « pas de note » est une réponse honnête.
 * - `team_comments.parent_comment_id` : une réponse se rattache à la racine de
 *   son fil. `resolved_at` / `resolved_by` : la racine est marquée résolue (et
 *   par qui) — jamais supprimée, un fil résolu se rouvre.
 *
 * AJOUT SEULEMENT : aucune colonne retirée, aucune valeur réécrite.
 */
export class TeamHandoffNoteAndThreadResolution1796523337902 implements MigrationInterface {
  name = 'TeamHandoffNoteAndThreadResolution1796523337902'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE action_plan_items
        ADD COLUMN IF NOT EXISTS handoff_note text,
        ADD COLUMN IF NOT EXISTS handoff_by uuid
    `)
    await queryRunner.query(`
      ALTER TABLE team_comments
        ADD COLUMN IF NOT EXISTS parent_comment_id uuid,
        ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
        ADD COLUMN IF NOT EXISTS resolved_by uuid
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS team_comments_parent_idx
        ON team_comments (workspace_id, parent_comment_id)
        WHERE parent_comment_id IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS team_comments_parent_idx`)
    await queryRunner.query(`
      ALTER TABLE team_comments
        DROP COLUMN IF EXISTS resolved_by,
        DROP COLUMN IF EXISTS resolved_at,
        DROP COLUMN IF EXISTS parent_comment_id
    `)
    await queryRunner.query(`
      ALTER TABLE action_plan_items
        DROP COLUMN IF EXISTS handoff_by,
        DROP COLUMN IF EXISTS handoff_note
    `)
  }
}
