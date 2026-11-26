import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `multi_source_search_jobs` — #1952.7 (épopée #2844, lot SRC5 28/09 soir) :
 * LA RECHERCHE MULTI-SOURCES DEVIENT ASYNCHRONE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * `ExternalSourcingService.search` interroge SES QUATRE fournisseurs
 * (`this.providers`) en parallèle (`Promise.all`) DANS la requête
 * (`GET needs/:needId/external-sourcing/search`) — aucun job à suivre, aucune
 * reprise si une source répond lentement. Même patron BullMQ + Socket.IO que
 * l'analyse : le lancement rend la main, chaque source interrogée avance la
 * ligne, jamais un rejeu des sources déjà répondues.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `results` EN JSONB
 * ─────────────────────────────────────────────────────────────────────────────
 * Une source SANS réponse observée (coupure d'infrastructure) porte
 * `unknown`, jamais `failed` — « un timeout n'est pas un échec » (CLAUDE.md).
 */
export class MultiSourceSearchJobs1796349920000 implements MigrationInterface {
  public name = 'MultiSourceSearchJobs1796349920000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS multi_source_search_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        need_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        total integer,
        processed_count integer NOT NULL DEFAULT 0,
        results jsonb NOT NULL DEFAULT '[]'::jsonb,
        candidates jsonb,
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(
      `ALTER TABLE multi_source_search_jobs DROP CONSTRAINT IF EXISTS multi_source_search_jobs_status_check`,
    )
    await queryRunner.query(`
      ALTER TABLE multi_source_search_jobs
        ADD CONSTRAINT multi_source_search_jobs_status_check
        CHECK (status IN ('queued', 'processing', 'done', 'failed'))
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS multi_source_search_jobs_workspace_idx
        ON multi_source_search_jobs (workspace_id, created_at DESC)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS multi_source_search_jobs_need_idx
        ON multi_source_search_jobs (need_id, created_at DESC)
    `)

    await queryRunner.query(`
      COMMENT ON TABLE multi_source_search_jobs IS
        'Recherche multi-sources, ASYNCHRONE et PERSISTEE (#1952.7, epopee #2844). processed_count est ou le worker reprend apres un crash.'
    `)

    await queryRunner.query(`ALTER TABLE multi_source_search_jobs ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'multi_source_search_jobs' AND policyname = 'multi_source_search_jobs_own_workspace'
        ) THEN
          CREATE POLICY multi_source_search_jobs_own_workspace ON multi_source_search_jobs
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
    await queryRunner.query(`DROP TABLE IF EXISTS multi_source_search_jobs`)
  }
}
