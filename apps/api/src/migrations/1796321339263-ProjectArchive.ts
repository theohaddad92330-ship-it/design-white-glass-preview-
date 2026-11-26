import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2171.39 — Archiver une opportunité. Même geste, même mécanisme que
 * `project_needs.archived_at` (migration `1789704872452-NeedArchive.ts`,
 * décision Louis 17/09/2026 : rangement NEUTRE) et `consultants.archived_at`
 * (`1789564918273-TalentArchive.ts`) : un horodatage, jamais un `status` de
 * plus — `stage`, `outcome` gardent EXACTEMENT ce qu'ils portaient. On
 * archive, on ne supprime pas ; remettre `archived_at` à `NULL` est le seul
 * geste inverse et ne touche lui non plus aucun autre champ.
 */
export class ProjectArchive1796321339263 implements MigrationInterface {
  public name = 'ProjectArchive1796321339263'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS archived_at timestamptz`)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS opportunities_active_idx
        ON opportunities (workspace_id, updated_at DESC)
        WHERE archived_at IS NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS opportunities_active_idx`)
    await queryRunner.query(`ALTER TABLE opportunities DROP COLUMN IF EXISTS archived_at`)
  }
}
