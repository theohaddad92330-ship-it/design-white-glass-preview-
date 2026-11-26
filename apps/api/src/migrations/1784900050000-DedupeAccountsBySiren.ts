import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Deduplicate accounts by (workspace_id, siren) and enforce it going forward
 * (Théo restitution p.18 : "P0 doublon SNCF — il faut Account canonique + un seul
 * compte, plusieurs runs"). Each analysis run used to create a NEW accounts row,
 * so re-analysing SNCF (or a teammate doing so) left 2-3 identical rows.
 *
 * SAFE by design — no deletion, no FK reassignment:
 *  1. Older duplicates sharing a real SIREN are ARCHIVED (status='archived'),
 *     keeping the most recent run. Archived accounts are hidden from the main
 *     list but fully recoverable — nothing is lost.
 *  2. A partial UNIQUE index then enforces one ACTIVE account per
 *     (workspace_id, siren) so the duplicate can't reappear. Rows with a NULL
 *     siren / NULL workspace_id (non-French, or mid workspace roll-out) are
 *     excluded from the constraint — NULLs are distinct in a unique index anyway.
 */
export class DedupeAccountsBySiren1784900050000 implements MigrationInterface {
  public name = 'DedupeAccountsBySiren1784900050000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Archive all-but-the-newest run per (workspace_id, siren). Only touches
    //    rows that genuinely collide on a real SIREN — never a NULL/blank one.
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY workspace_id, siren
          ORDER BY created_at DESC
        ) AS rn
        FROM accounts
        WHERE siren IS NOT NULL
          AND siren <> ''
          AND workspace_id IS NOT NULL
          AND status NOT IN ('deleted', 'archived')
      )
      UPDATE accounts
      SET status = 'archived'
      WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    `)

    // 2. Enforce one active account per (workspace_id, siren) from now on.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS accounts_workspace_siren_active_uniq
      ON accounts (workspace_id, siren)
      WHERE siren IS NOT NULL AND siren <> '' AND workspace_id IS NOT NULL
        AND status NOT IN ('deleted', 'archived')
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only the index is reversible; the archiving is intentionally not undone
    // (we don't record which rows were auto-archived, and un-archiving would
    // re-introduce the duplicates this migration removed).
    await queryRunner.query(`DROP INDEX IF EXISTS accounts_workspace_siren_active_uniq`)
  }
}
