import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Partial expression index on the outbox table so the resume flow can look
 * up an account's completed phases in O(log N) instead of scanning every
 * outbox row.
 *
 * The query the index supports lives in ``AnalysisCheckpointReader``:
 *
 *   SELECT DISTINCT payload->>'phase'
 *   FROM outbox
 *   WHERE event_type = 'analysis.phase_completed'
 *     AND payload->>'accountId' = $1;
 *
 * Without the index, this query gets slower linearly with outbox growth,
 * and the resume flow (called at the start of every worker run, including
 * fresh runs that find an empty set) would tax the table by O(N).
 *
 * The index is **partial** (``WHERE event_type = 'analysis.phase_completed'``)
 * so it stays compact even when the outbox carries dozens of other event
 * types — only ~3 rows per account land in the index (research / contacts
 * / classify checkpoints).
 */
export class OutboxAnalysisPhaseAccountIndex1779091200000 implements MigrationInterface {
  public name = 'OutboxAnalysisPhaseAccountIndex1779091200000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS outbox_analysis_phase_account_idx
        ON outbox ((payload->>'accountId'))
        WHERE event_type = 'analysis.phase_completed'
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
