import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `bulk_cv_rewrite_jobs` — #1952.5 (épopée #2844, lot SRC5 28/09 soir) : LA
 * RÉÉCRITURE DE CV EN LOT DEVIENT UN JOB.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUE #1952.5 N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * « CV en lot » a deux lectures possibles dans ce dépôt, et ce n'est PAS la
 * première : l'IMPORT de CV en masse (déposer des fichiers pour créer/mettre
 * à jour des fiches) est déjà asynchrone depuis #2326.12 (épopée #2794,
 * `cv_batch_import_jobs`) — un lot ANTÉRIEUR à celui-ci l'avait pris pour
 * #1952.5 par erreur. Le tri réel de l'épopée #2844 (bilan du 28/09 14:03)
 * porte sur la RÉÉCRITURE (`ConsultantsService.rewriteCv`, un appel modèle
 * facturé `cv_rewrite`, un consultant à la fois) — c'est CETTE table qui la
 * suit en lot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN BESOIN, PLUSIEURS CONSULTANTS
 * ─────────────────────────────────────────────────────────────────────────────
 * `results` porte l'issue de CHAQUE consultant, isolée (même règle que
 * `bulk_matching_jobs`, #2293.7) : un échec IA sur un profil n'arrête pas les
 * suivants. Aucune grille de prix par lot n'est inventée ici (#1952.2 reste
 * `H`, hors de cette tranche) : chaque réécriture réussie débite EXACTEMENT
 * 1 crédit `cv_rewrite`, comme le geste unitaire.
 */
export class BulkCvRewriteJobs1796376712468 implements MigrationInterface {
  public name = 'BulkCvRewriteJobs1796376712468'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bulk_cv_rewrite_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        opportunity_id uuid NOT NULL,
        consultant_ids jsonb NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        total integer NOT NULL,
        processed_count integer NOT NULL DEFAULT 0,
        results jsonb NOT NULL DEFAULT '[]'::jsonb,
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(
      `ALTER TABLE bulk_cv_rewrite_jobs DROP CONSTRAINT IF EXISTS bulk_cv_rewrite_jobs_status_check`,
    )
    await queryRunner.query(`
      ALTER TABLE bulk_cv_rewrite_jobs
        ADD CONSTRAINT bulk_cv_rewrite_jobs_status_check
        CHECK (status IN ('queued', 'processing', 'done', 'failed'))
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS bulk_cv_rewrite_jobs_workspace_idx
        ON bulk_cv_rewrite_jobs (workspace_id, created_at DESC)
    `)

    await queryRunner.query(`
      COMMENT ON TABLE bulk_cv_rewrite_jobs IS
        'Reecriture de CV en lot, ASYNCHRONE et PERSISTEE (#1952.5, epopee #2844). Un crédit cv_rewrite par consultant reussi, jamais un prix de lot invente.'
    `)

    await queryRunner.query(`ALTER TABLE bulk_cv_rewrite_jobs ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'bulk_cv_rewrite_jobs' AND policyname = 'bulk_cv_rewrite_jobs_own_workspace'
        ) THEN
          CREATE POLICY bulk_cv_rewrite_jobs_own_workspace ON bulk_cv_rewrite_jobs
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
    await queryRunner.query(`DROP TABLE IF EXISTS bulk_cv_rewrite_jobs`)
  }
}
