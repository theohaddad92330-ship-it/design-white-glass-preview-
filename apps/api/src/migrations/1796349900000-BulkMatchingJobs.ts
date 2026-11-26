import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `bulk_matching_jobs` — #1952.3 (épopée #2844, lot SRC5 28/09 soir) : LE
 * MATCHING MASSIF DEVIENT ASYNCHRONE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * `MatchingService.matchNeed` tourne dans la requête (`POST needs/:id/match`),
 * un besoin à la fois. Lancer le classement de plusieurs besoins d'un coup
 * boucle dans le navigateur — aucun job à suivre, aucune reprise si la page se
 * ferme au milieu. Même patron que `cv_batch_import_jobs`
 * (`1796322044000-CvBatchImportJobs`) : le worker PERSISTE l'état, le job
 * REPREND après un crash depuis `processed_count`, jamais depuis zéro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `need_ids` ET `results` EN JSONB
 * ─────────────────────────────────────────────────────────────────────────────
 * `need_ids` porte la liste D'ENTRÉE (l'ordre de traitement) ; `results` porte
 * l'ISSUE de chaque besoin déjà traité — un échec sur UN besoin n'arrête pas
 * les suivants (isolation, même règle que `AnalysisBatchesService`, #2293.7).
 * Un besoin sans réponse observée (coupure d'infrastructure) porte `unknown`,
 * jamais `failed` : « un timeout n'est pas un échec » (CLAUDE.md).
 */
export class BulkMatchingJobs1796349900000 implements MigrationInterface {
  public name = 'BulkMatchingJobs1796349900000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bulk_matching_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        need_ids jsonb NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        total integer NOT NULL,
        processed_count integer NOT NULL DEFAULT 0,
        results jsonb NOT NULL DEFAULT '[]'::jsonb,
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`ALTER TABLE bulk_matching_jobs DROP CONSTRAINT IF EXISTS bulk_matching_jobs_status_check`)
    await queryRunner.query(`
      ALTER TABLE bulk_matching_jobs
        ADD CONSTRAINT bulk_matching_jobs_status_check
        CHECK (status IN ('queued', 'processing', 'done', 'failed'))
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS bulk_matching_jobs_workspace_idx
        ON bulk_matching_jobs (workspace_id, created_at DESC)
    `)

    await queryRunner.query(`
      COMMENT ON TABLE bulk_matching_jobs IS
        'Matching massif, ASYNCHRONE et PERSISTE (#1952.3, epopee #2844). processed_count est ou le worker reprend apres un crash - jamais un rejeu depuis le debut.'
    `)

    await queryRunner.query(`ALTER TABLE bulk_matching_jobs ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'bulk_matching_jobs' AND policyname = 'bulk_matching_jobs_own_workspace'
        ) THEN
          CREATE POLICY bulk_matching_jobs_own_workspace ON bulk_matching_jobs
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
    await queryRunner.query(`DROP TABLE IF EXISTS bulk_matching_jobs`)
  }
}
