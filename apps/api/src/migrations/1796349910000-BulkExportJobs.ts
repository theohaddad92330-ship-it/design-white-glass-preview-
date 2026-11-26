import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `bulk_export_jobs` — #1952.6 (épopée #2844, lot SRC5 28/09 soir) : L'EXPORT
 * EN LOT DEVIENT UN JOB.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * `AtsExportService.export` (#2326.8) rend les lignes DANS la requête, bornées
 * à `ATS_EXPORT_MAX_ROWS` — le CSV lui-même se construit côté navigateur
 * (garde web `a-csv-leaves-only-through-the-workspace-rule`). Un vivier plus
 * grand que la borne, ou une conversation qui ne peut pas tenir la page
 * ouverte pendant la construction, n'a aucun chemin. Même patron BullMQ +
 * Socket.IO que l'analyse : le CSV se construit en tâche de fond, l'écran (ou
 * Laura) suit sa progression et récupère le fichier au clic, une fois prêt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `result_csv` EN BASE, JAMAIS UN OBJET DE STOCKAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `BULK_EXPORT_MAX_ROWS` (20 000, `@bellum/contracts`) borne le texte à une
 * taille raisonnable pour une colonne Postgres — un objet de stockage
 * (`StorageDomain`) resterait à inventer pour un fichier plus gros, hors de
 * cette tranche.
 */
export class BulkExportJobs1796349910000 implements MigrationInterface {
  public name = 'BulkExportJobs1796349910000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bulk_export_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        kind text NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        total integer,
        processed_count integer NOT NULL DEFAULT 0,
        row_count integer,
        result_csv text,
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`ALTER TABLE bulk_export_jobs DROP CONSTRAINT IF EXISTS bulk_export_jobs_kind_check`)
    await queryRunner.query(`
      ALTER TABLE bulk_export_jobs
        ADD CONSTRAINT bulk_export_jobs_kind_check
        CHECK (kind IN ('consultants_csv'))
    `)
    await queryRunner.query(`ALTER TABLE bulk_export_jobs DROP CONSTRAINT IF EXISTS bulk_export_jobs_status_check`)
    await queryRunner.query(`
      ALTER TABLE bulk_export_jobs
        ADD CONSTRAINT bulk_export_jobs_status_check
        CHECK (status IN ('queued', 'processing', 'done', 'failed'))
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS bulk_export_jobs_workspace_idx
        ON bulk_export_jobs (workspace_id, created_at DESC)
    `)

    await queryRunner.query(`
      COMMENT ON TABLE bulk_export_jobs IS
        'Export en lot, ASYNCHRONE et PERSISTE (#1952.6, epopee #2844). result_csv est borne a BULK_EXPORT_MAX_ROWS lignes.'
    `)

    await queryRunner.query(`ALTER TABLE bulk_export_jobs ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'bulk_export_jobs' AND policyname = 'bulk_export_jobs_own_workspace'
        ) THEN
          CREATE POLICY bulk_export_jobs_own_workspace ON bulk_export_jobs
            USING (
              workspace_id IN (
                SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
              )
            );
        END IF;
      EXCEPTION
        WHEN undefined_function OR undefined_table OR undefined_object THEN NULL;
      END
      $$
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS bulk_export_jobs`)
  }
}
