import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Webhooks v2 — make the self-serve outbound integrations sellable (retour
 * Théo, addendum p.22). Two additive changes:
 *
 * 1. `integration_deliveries` — the delivery journal. One row per outbound
 *    event delivery (not per attempt): the row is created `pending` when the
 *    event is enqueued and updated on every attempt with the latest attempt
 *    number / HTTP status / sanitized error. `error` NEVER contains the target
 *    URL (it embeds a secret token) nor any event payload — the worker scrubs
 *    URLs and truncates before writing. FK cascades so deleting an integration
 *    wipes its journal. RLS mirrors the neighbouring `integrations` table
 *    (`auth.uid() = user_id`) but read-only: rows are system-written (the API
 *    connects with the service role and bypasses RLS), the user only reads.
 *
 * 2. `integrations.events` — per-integration event allow-list (JSONB array,
 *    e.g. `["buy_signal"]`). NULL = every event, which is the pre-existing
 *    behaviour, so all current rows keep working unchanged (compat).
 */
export class IntegrationDeliveries1785940000000 implements MigrationInterface {
  public name = 'IntegrationDeliveries1785940000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration_deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        event TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
        http_status INT,
        attempt INT NOT NULL DEFAULT 0,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    // The journal query: latest 50 deliveries of one integration.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS integration_deliveries_integration_created_idx
        ON integration_deliveries (integration_id, created_at DESC)
    `)

    await queryRunner.query(`ALTER TABLE integration_deliveries ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE POLICY "Users can read their own integration deliveries"
        ON integration_deliveries
        FOR SELECT
        USING (auth.uid() = user_id)
    `)

    // NULL = all events (compat with every existing row).
    await queryRunner.query(`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS events JSONB`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS integration_deliveries`)
    await queryRunner.query(`ALTER TABLE integrations DROP COLUMN IF EXISTS events`)
  }
}
