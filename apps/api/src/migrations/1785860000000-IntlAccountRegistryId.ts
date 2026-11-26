import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Cross-border canonical-account dedup (international markets US/CA/CH/BE/LU).
 *
 * The canonical-account dedup introduced by ``DedupeAccountsBySiren1784900050000``
 * keys EXCLUSIVELY on the French SIREN, so a non-French account (identified by a
 * SEC CIK, a Corporations-Canada corp id, a Swiss UID, a Belgian BCE number, a
 * Luxembourg RCS…) never deduplicates — re-analysing EPAM Systems stacks
 * duplicate rows exactly like SNCF used to before the SIREN index.
 *
 * This migration generalises the pivot:
 *
 *  1. Two ADDITIVE nullable columns on ``accounts``:
 *       - ``registry_id``      — the national registry identifier, stored in its
 *                                CANONICAL form (CIK zero-padded to 10, UID
 *                                ``CHE`` + 9 digits without dots/dashes, BCE 10
 *                                digits, RCS ``B<digits>``…). Normalisation lives
 *                                in ``modules/accounts/registry-id.util.ts``.
 *       - ``registry_country`` — the ISO-ish 2-letter country of that registry
 *                                (``US``/``CA``/``CH``/``BE``/``LU``/``FR``…).
 *  2. FR backfill: ``registry_id = siren`` / ``registry_country = 'FR'`` wherever
 *     a SIREN is already stored — the SIREN *is* the French registry id, so every
 *     legacy row lands in the generalised key space with zero data loss.
 *  3. A partial UNIQUE index on ``(workspace_id, registry_country, registry_id)``
 *     mirroring the SIREN one (same active-row predicate) so one workspace keeps
 *     ONE active canonical account per foreign company going forward.
 *
 * The legacy ``accounts_workspace_siren_active_uniq`` index is deliberately
 * KEPT, not replaced: the live FR write path (``AccountsService.applyResearch``)
 * still stamps + dedups on ``siren`` only — the registry columns are written by
 * the non-FR path exclusively, and FR rows created AFTER this migration carry a
 * NULL ``registry_id`` (the FR pipeline is strictly unchanged). Dropping the
 * SIREN index would therefore leave every new French account unguarded. The two
 * indexes coexist: ``siren`` guards FR, ``(registry_country, registry_id)``
 * guards the international markets.
 *
 * SAFE by design — additive columns, no deletion, no FK reassignment. The
 * defensive archive pass in step 3 mirrors the SIREN migration and only fires on
 * a genuine active collision (none can exist today: the backfilled FR keys are
 * already unique under the SIREN index, and non-FR rows all backfill to NULL).
 */
export class IntlAccountRegistryId1785860000000 implements MigrationInterface {
  public name = 'IntlAccountRegistryId1785860000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Additive nullable columns — no default, no rewrite, instant on Postgres.
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS registry_id TEXT`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS registry_country TEXT`)

    // 2. FR backfill: the SIREN is the French registry identifier (already stored
    //    canonical: 9 digits). Only rows with a real SIREN are stamped; the guard
    //    on ``registry_id IS NULL`` makes the migration idempotent on re-run.
    await queryRunner.query(`
      UPDATE accounts
      SET registry_id = siren, registry_country = 'FR'
      WHERE siren IS NOT NULL AND siren <> ''
        AND registry_id IS NULL
    `)

    // 3a. Defensive archive pass (mirror of DedupeAccountsBySiren): archive
    //     all-but-the-newest ACTIVE row per (workspace_id, registry_country,
    //     registry_id) so the unique index below can never fail to build. A
    //     no-op today — the SIREN unique index already guarantees the backfilled
    //     FR keys are unique and non-FR rows have no registry_id yet — but it
    //     keeps the migration safe against any drift. Archived rows stay fully
    //     recoverable (status flip only — nothing is lost).
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY workspace_id, registry_country, registry_id
          ORDER BY created_at DESC
        ) AS rn
        FROM accounts
        WHERE registry_id IS NOT NULL
          AND registry_id <> ''
          AND registry_country IS NOT NULL
          AND workspace_id IS NOT NULL
          AND status NOT IN ('deleted', 'archived')
      )
      UPDATE accounts
      SET status = 'archived'
      WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    `)

    // 3b. One ACTIVE canonical account per (workspace, registry country, registry
    //     id) from now on. Predicate mirrors accounts_workspace_siren_active_uniq
    //     (same non-empty / non-null / active-status guards) so both constraints
    //     age identically.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS accounts_workspace_registry_active_uniq
      ON accounts (workspace_id, registry_country, registry_id)
      WHERE registry_id IS NOT NULL AND registry_id <> ''
        AND registry_country IS NOT NULL AND workspace_id IS NOT NULL
        AND status NOT IN ('deleted', 'archived')
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The archive pass is intentionally not undone (same rationale as the SIREN
    // migration: we don't record which rows were auto-archived).
    await queryRunner.query(`DROP INDEX IF EXISTS accounts_workspace_registry_active_uniq`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS registry_country`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS registry_id`)
  }
}
