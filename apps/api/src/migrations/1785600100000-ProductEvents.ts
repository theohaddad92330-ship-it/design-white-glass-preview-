import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Self-hosted product-analytics event log (P1 Analytics roadmap). One append-only
 * row per meaningful product action — onboarding, analyses, enrichments, exports,
 * messages, billing — so we can derive day-1 metrics (activation, analyses per
 * workspace, credits used, cost/analysis, engagement) WITHOUT shipping data to a
 * third-party analytics SaaS (the repo forbids adding vendor keys without cause).
 *
 * SAFE: brand-new isolated table, no FK (bare `uuid` so an event survives a user
 * or workspace deletion for auditability), no change to any existing table. It is
 * filled best-effort at the edges — a write failure never blocks the business
 * flow. History starts here; no backfill.
 *
 * Indexes mirror the two read axes of the overview: `(event_name, occurred_at)`
 * for per-event-type windows and `(workspace_id, occurred_at)` for the per-team
 * rollups.
 */
export class ProductEvents1785600100000 implements MigrationInterface {
  public name = 'ProductEvents1785600100000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS product_events (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        event_name text NOT NULL,
        user_id uuid NOT NULL,
        workspace_id uuid,
        properties jsonb NOT NULL DEFAULT '{}'::jsonb,
        session_id text,
        occurred_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS product_events_name_occurred_idx
      ON product_events (event_name, occurred_at DESC)
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS product_events_workspace_occurred_idx
      ON product_events (workspace_id, occurred_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS product_events_workspace_occurred_idx`)
    await queryRunner.query(`DROP INDEX IF EXISTS product_events_name_occurred_idx`)
    await queryRunner.query(`DROP TABLE IF EXISTS product_events`)
  }
}
