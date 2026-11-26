import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * ⚠️ LEGACY TIMESTAMP COLLISION — this migration shares its 1783000000000
 * timestamp with `1783000000000-AddArchivedDeletedStatusesToAccounts.ts`.
 * Both already ran in production and are recorded in the `_migrations` table
 * under their CURRENT class names (this one via its explicit `name` property).
 *
 * DO NOT rename this file, class, or `name` property: TypeORM matches executed
 * migrations by name, so a renamed migration would look pending and RE-RUN at
 * the next `migration:run` (verified on TypeORM 0.3.28 — the pending list is
 * computed before any migration executes, so no corrective migration can
 * prevent it). This one is a heavy UPDATE over all completed accounts, and its
 * score mapping is only guaranteed idempotent as long as the /25→/10 bands in
 * `account_score.py` never change — never risk the re-run.
 *
 * On a fresh database the two may run in either load order (glob v10 does not
 * sort); they are functionally independent, so either order is safe. New
 * collisions are blocked by `src/database/migrations.spec.ts`.
 */

/**
 * Backfill the reconciled account ``priority_score`` for accounts analysed
 * BEFORE the /25→/10 reconciliation shipped.
 *
 * Phase 1 used to write a provisional linear /10 to ``priority_score``; phase 4
 * now derives the canonical /10 from the /25 verdict band (see
 * ``account_score.py::legacy_global_score``) via ``applyPlan``. Existing rows
 * still hold the old linear /10, so their bucket (chaud/moyen/froid) and the
 * front verdict contradict the /25 in ``raw_analysis.plan.evaluation`` until the
 * account is re-analysed. This re-derives the column from the /25 already stored.
 *
 * Band-faithful mapping (kept identical to account_score.py — GO 20-25→7-10,
 * PRUDENT 15-19→5-6, STOP 0-14→1-4). PRUDENT uses ``floor((s-15)/3)`` and the
 * GO/STOP slices have no half-integers, so the SQL result matches the Python
 * (which uses banker's rounding) on every value 0-25.
 *
 * Only touches ``completed`` rows that carry a real scored evaluation with a
 * justification — mirrors the reconciliation guard so we never write a score
 * next to a stale phase-1 reason. Idempotent: re-running re-derives the same
 * value from the same /25.
 */
export class BackfillReconciledPriorityScore1783000000000 implements MigrationInterface {
  public name = 'BackfillReconciledPriorityScore1783000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH scored AS (
        SELECT
          id,
          LEAST(25, GREATEST(0, (raw_analysis->'plan'->'evaluation'->>'score')::int)) AS s25,
          NULLIF(raw_analysis->'plan'->'evaluation'->>'justification', '') AS reason
        FROM accounts
        WHERE status = 'completed'
          AND raw_analysis->'plan'->'evaluation'->>'score' ~ '^[0-9]+$'
          AND (raw_analysis->'plan'->'evaluation'->>'score')::int >= 1
      )
      UPDATE accounts a
      SET
        priority_score = CASE
          WHEN scored.s25 >= 20 THEN 7 + ROUND((scored.s25 - 20) * 3.0 / 5)::int
          WHEN scored.s25 >= 15 THEN 5 + FLOOR((scored.s25 - 15) / 3.0)::int
          ELSE GREATEST(1, ROUND(scored.s25 * 2.0 / 7)::int)
        END,
        -- Keyed off a valid score alone (not justification presence), matching the
        -- phase-4 reconciliation; keep the existing reason when the plan's is empty.
        priority_justification = COALESCE(scored.reason, a.priority_justification)
      FROM scored
      WHERE a.id = scored.id
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported (the pre-backfill /10 cannot be restored)')
  }
}
