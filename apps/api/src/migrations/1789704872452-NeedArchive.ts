import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2173.49 — Archiver un besoin. Décision Louis, 17/09/2026 matin (QCM) :
 * **rangement NEUTRE** — archiver n'est pas un statut, et le statut du besoin
 * ne change PAS.
 *
 * `archived_at`, jamais un `status` de plus ni une valeur d'énumération
 * ajoutée à `project_needs_status_check` : un besoin archivé garde EXACTEMENT
 * le statut qu'il avait — `won`, `lost`, `to_qualify`, n'importe lequel — et
 * seul ce champ dit qu'il a été rangé. Même mécanisme que
 * `consultants.archived_at` (migration `1789564918273-TalentArchive.ts`) :
 * un horodatage plutôt qu'un booléen, pour savoir QUAND, jamais seulement SI.
 *
 * Désarchivable : remettre `archived_at` à `NULL` est le seul geste inverse,
 * et il ne touche lui non plus aucun statut — « on archive, on ne supprime
 * pas » vaut aussi dans l'autre sens.
 */
export class NeedArchive1789704872452 implements MigrationInterface {
  public name = 'NeedArchive1789704872452'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE project_needs ADD COLUMN IF NOT EXISTS archived_at timestamptz`)
    // L'index porte sur les besoins ACTIFS (non archivés) : c'est la lecture de
    // tous les jours (l'écran « Besoins ouverts »), et la vue « Archivés » est
    // consultée rarement — même choix que `consultants_active_idx`.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS project_needs_active_idx
        ON project_needs (workspace_id, created_at DESC)
        WHERE archived_at IS NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS project_needs_active_idx`)
    await queryRunner.query(`ALTER TABLE project_needs DROP COLUMN IF EXISTS archived_at`)
  }
}
