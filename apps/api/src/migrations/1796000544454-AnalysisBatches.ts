import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2293.5 / .6 (LAU-FINAL-034) — LE LOT D'ANALYSES MULTI-COMPTES.
 *
 * Deux tables neuves, et rien d'autre : porte « ajout seulement ».
 *
 * `analysis_batches` est le JOB PARENT ; `analysis_batch_items` porte un
 * sous-job par entreprise. Chaque sous-job lancé EST une analyse unitaire
 * ordinaire (`account_id`) : la file, le débit et le remboursement restent
 * ceux de l'analyse — cette table ne fait que les SUIVRE.
 *
 * Le statut du parent n'a PAS de colonne : il s'agrège de ses sous-jobs
 * (`summarizeAnalysisBatch`, contrat). Seule l'annulation, qui est un geste,
 * se date (`canceled_at`).
 *
 * `name` est la saisie de l'utilisateur, pas une copie de la fiche : un
 * sous-job « à confirmer » n'a pas encore de compte à référencer.
 *
 * Les deux contraintes d'énumération naissent AVEC leurs colonnes et couvrent
 * exactement `ANALYSIS_BATCH_ITEM_STATES` et `ANALYSIS_BATCH_SOURCES` (GA-11/12).
 */
export class AnalysisBatches1796000544454 implements MigrationInterface {
  name = 'AnalysisBatches1796000544454'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS analysis_batches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        created_by uuid NOT NULL,
        source text NOT NULL,
        canceled_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT analysis_batches_source_check CHECK (source IN ('names', 'identifiers', 'target_list', 'discover', 'portfolio', 'import', 'laura', 'saved_search'))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS analysis_batches_workspace_idx ON analysis_batches (workspace_id, created_at DESC)`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS analysis_batch_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        batch_id uuid NOT NULL REFERENCES analysis_batches(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        position integer NOT NULL,
        name text NOT NULL,
        siren text NULL,
        account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
        state text NOT NULL,
        candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
        failure_code text NULL,
        charged boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT analysis_batch_items_state_check CHECK (state IN ('resolved', 'to_confirm', 'queued', 'running', 'partial', 'done', 'failed', 'canceled'))
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS analysis_batch_items_batch_idx ON analysis_batch_items (batch_id, position)`,
    )

    await queryRunner.query(`ALTER TABLE analysis_batches ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`ALTER TABLE analysis_batch_items ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS analysis_batch_items`)
    await queryRunner.query(`DROP TABLE IF EXISTS analysis_batches`)
  }
}
