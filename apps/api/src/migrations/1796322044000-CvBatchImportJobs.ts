import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `cv_batch_import_jobs` — l'import de CV en masse devient ASYNCHRONE et
 * PERSISTANT (#2326.12, épopée #2794).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * `CvBatchImportService.importZip`/`importFiles` bouclaient de façon
 * SYNCHRONE dans la requête HTTP : `git grep "BullModule" apps/api/src/modules/consultants`
 * rendait 0 résultat (vérifié à plusieurs reprises, 25-26/09/2026). Un lot de
 * 300 CV qui tombait au milieu (déconnexion, restart de l'instance) ne
 * laissait aucune trace, et rien ne pouvait reprendre où il s'était arrêté.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `outcomes` EN JSONB, `processed_count` EN COLONNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Même patron que `org_enrichment_jobs.waves` : une issue de fichier n'a pas de
 * vie propre hors de son job, jamais interrogée seule — une table fille
 * ajouterait une jointure et un ordre à maintenir pour rien. `processed_count`
 * reste une colonne À PART : c'est elle que le worker relit pour savoir où
 * reprendre après un crash (BullMQ retente le même job, `entries` reste dans
 * les données du job Redis), sans rouvrir tout le tableau `outcomes`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORTÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * `workspace_id` : un import est le travail d'une ESN sur son propre vivier, et
 * deux espaces sont deux concurrents. `user_id` garde QUI a lancé, ce n'est pas
 * une clé de portée.
 */
export class CvBatchImportJobs1796322044000 implements MigrationInterface {
  public name = 'CvBatchImportJobs1796322044000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cv_batch_import_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        kind text NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        total integer NOT NULL,
        processed_count integer NOT NULL DEFAULT 0,
        outcomes jsonb NOT NULL DEFAULT '[]'::jsonb,
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    // Nommées explicitement (GA-177) — voir le MAPPING de
    // `check-constraints-cover-enums.spec.ts` (GA-12).
    await queryRunner.query(
      `ALTER TABLE cv_batch_import_jobs DROP CONSTRAINT IF EXISTS cv_batch_import_jobs_kind_check`,
    )
    await queryRunner.query(`
      ALTER TABLE cv_batch_import_jobs
        ADD CONSTRAINT cv_batch_import_jobs_kind_check
        CHECK (kind IN ('zip', 'files'))
    `)
    await queryRunner.query(
      `ALTER TABLE cv_batch_import_jobs DROP CONSTRAINT IF EXISTS cv_batch_import_jobs_status_check`,
    )
    await queryRunner.query(`
      ALTER TABLE cv_batch_import_jobs
        ADD CONSTRAINT cv_batch_import_jobs_status_check
        CHECK (status IN ('queued', 'processing', 'done', 'failed'))
    `)

    // La requête qui porte l'écran de suivi : « où en est ce job ? ».
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS cv_batch_import_jobs_workspace_idx
        ON cv_batch_import_jobs (workspace_id, created_at DESC)
    `)

    await queryRunner.query(`
      COMMENT ON TABLE cv_batch_import_jobs IS
        'Import de CV en masse, ASYNCHRONE et PERSISTE (#2326.12, epopee #2794). processed_count est ou le worker reprend apres un crash - jamais un rejeu depuis le debut.'
    `)

    await queryRunner.query(`ALTER TABLE cv_batch_import_jobs ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'cv_batch_import_jobs' AND policyname = 'cv_batch_import_jobs_own_workspace'
        ) THEN
          CREATE POLICY cv_batch_import_jobs_own_workspace ON cv_batch_import_jobs
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
    await queryRunner.query(`DROP TABLE IF EXISTS cv_batch_import_jobs`)
  }
}
