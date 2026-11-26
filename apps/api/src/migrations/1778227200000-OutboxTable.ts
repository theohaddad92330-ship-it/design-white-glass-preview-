import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Outbox table for the transactional event publishing pattern
 * (see apps/api/src/modules/outbox/).
 *
 * Producer side (worker, on-demand service): the same DB transaction that
 * writes the business change inserts a row here. If the transaction commits,
 * the event WILL be published — eventual consistency.
 *
 * Drainer side: a background loop reads `pending` rows in created_at order,
 * publishes them to Redis Streams via @bellum/events, then flips status to
 * `published`. On publish failure: increments attempts, eventually moves to
 * `dead` after MAX_ATTEMPTS so the queue head doesn't wedge.
 */
export class OutboxTable1778227200000 implements MigrationInterface {
  public name = 'OutboxTable1778227200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outbox (
        event_id      UUID        PRIMARY KEY,
        event_type    TEXT        NOT NULL,
        payload       JSONB       NOT NULL,
        status        TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'published', 'dead')),
        attempts      INTEGER     NOT NULL DEFAULT 0,
        last_error    TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        published_at  TIMESTAMPTZ
      )
    `)

    // Partial index supports the drainer's hot path:
    //   SELECT * FROM outbox WHERE status='pending' ORDER BY created_at LIMIT N;
    // Published/dead rows live in the table for audit but don't bloat the index.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS outbox_pending_idx
        ON outbox (created_at)
        WHERE status = 'pending'
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
