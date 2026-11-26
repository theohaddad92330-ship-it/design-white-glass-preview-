import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Append-only history of analysis runs per account (Théo restitution P0 : « Un
 * compte racine, plusieurs AnalysisRun. Historique, refresh, debug, export »).
 * Re-analysing an account currently overwrites the single ``accounts`` row, so
 * each new run erases the previous one — this table records one immutable row
 * per run instead.
 *
 * SAFE : nouvelle table isolée, aucune FK dure (``account_id`` en ``uuid`` nu
 * pour survivre à une suppression de compte sans casser l'historique), aucun
 * changement sur les tables existantes. L'historique commence ici (pas de
 * backfill — les runs passés ne sont pas reconstituables). API-owned (rôle
 * service) : pas de RLS, comme ``credit_ledger`` / les tables OAuth.
 */
export class AnalysisRuns1784900600000 implements MigrationInterface {
  public name = 'AnalysisRuns1784900600000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS analysis_runs (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        account_id uuid NOT NULL,
        user_id uuid NOT NULL,
        workspace_id uuid,
        status text NOT NULL DEFAULT 'analyzing',
        scope_mode text,
        siren text,
        cost_eur numeric(10, 4),
        prompt_versions jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz
      )
    `)

    // Newest-first history reads for one account (the "Historique des analyses"
    // panel + any export) hit exactly this shape.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS analysis_runs_account_created_idx
      ON analysis_runs (account_id, created_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS analysis_runs_account_created_idx`)
    await queryRunner.query(`DROP TABLE IF EXISTS analysis_runs`)
  }
}
