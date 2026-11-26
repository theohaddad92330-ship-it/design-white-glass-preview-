import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Workspace-canonical ESN profile (gap B3 — profil clé sur user_id).
 *
 * The COMPANY profile (name, size, offers, sectors, geo…) belongs to the
 * WORKSPACE, not to each member: this migration adds the notion of a
 * "canonical" `esn_profiles` row per workspace. Members keep their own row as
 * a light personal overlay (today: `main_sales_pain` — see
 * `ESN_PERSONAL_ANSWER_KEYS` in @bellum/contracts); resolution merges
 * canonical company fields + the member's personal answers.
 *
 * Migration-safe by construction:
 *  - `workspace_id` is nullable and `is_workspace_canonical` defaults false —
 *    no existing row changes meaning until backfilled.
 *  - Backfill: for each workspace, the OWNER's current profile becomes the
 *    canonical one. Phase-1 seeded one workspace per user with that user as
 *    owner, so for a mono-user workspace the canonical row IS the user's own
 *    row → resolution stays byte-identical (the resolver returns the member's
 *    own answers whenever the canonical row belongs to them).
 *  - Idempotent: `IF NOT EXISTS` on DDL; the backfill only touches rows still
 *    NULL and skips workspaces that already have a current canonical row (so a
 *    re-run can never violate the partial unique index).
 *
 * FK note: `ON DELETE SET NULL` — deleting a workspace strands the flag on a
 * NULL `workspace_id`, which is inert (every canonical lookup filters on
 * `workspace_id = :id`, and the partial unique index treats NULLs as distinct).
 *
 * RLS: additive SELECT policy so workspace members can read their team's
 * canonical row under user-scoped JWTs. Defense-in-depth only — the NestJS API
 * (postgres, BYPASSRLS) and the IA (service_role) both bypass RLS; the write
 * gate (owner/admin via `team:manage`) lives in the service layer.
 */
export class WorkspaceEsnProfile1785910000000 implements MigrationInterface {
  public name = 'WorkspaceEsnProfile1785910000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles
      ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL
    `)
    await queryRunner.query(`
      ALTER TABLE esn_profiles
      ADD COLUMN IF NOT EXISTS is_workspace_canonical BOOLEAN NOT NULL DEFAULT false
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS esn_profiles_workspace_idx ON esn_profiles (workspace_id)
    `)

    // At most ONE current canonical profile per workspace.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS esn_profiles_workspace_canonical_idx
      ON esn_profiles (workspace_id)
      WHERE is_workspace_canonical AND is_current
    `)

    // Backfill — the workspace OWNER's current profile becomes the canonical
    // one. DISTINCT ON pins the OLDEST workspace per owner (mirrors
    // WorkspaceContextService.resolveActiveWorkspace ordering) in case a user
    // owns several. NOT EXISTS keeps re-runs (and partially-applied runs)
    // idempotent against the partial unique index.
    await queryRunner.query(`
      UPDATE esn_profiles p
      SET workspace_id = w.id, is_workspace_canonical = true
      FROM (
        SELECT DISTINCT ON (owner_user_id) id, owner_user_id
        FROM workspaces
        ORDER BY owner_user_id, created_at ASC
      ) w
      WHERE w.owner_user_id = p.user_id
        AND p.is_current = true
        AND p.workspace_id IS NULL
        AND p.is_workspace_canonical = false
        AND NOT EXISTS (
          SELECT 1 FROM esn_profiles c
          WHERE c.workspace_id = w.id AND c.is_workspace_canonical AND c.is_current
        )
    `)

    // Members may READ their workspace's canonical profile (additive to the
    // per-user policies from 1780000000000 — permissive policies OR together).
    await queryRunner.query(`DROP POLICY IF EXISTS "esn_profiles_select_workspace_canonical" ON esn_profiles`)
    await queryRunner.query(`
      CREATE POLICY "esn_profiles_select_workspace_canonical" ON esn_profiles FOR SELECT USING (
        is_workspace_canonical
        AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
      )
    `)

    await queryRunner.query(`
      COMMENT ON COLUMN esn_profiles.is_workspace_canonical IS
        'Marks THE shared company profile of workspace_id (one current row per workspace, enforced by esn_profiles_workspace_canonical_idx). Company fields resolve from this row for every member; members'' own rows only carry their personal overlay.'
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
