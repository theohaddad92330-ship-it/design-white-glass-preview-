import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Multi-user foundation — Phase 1 (additive, non-breaking).
 *
 * Introduces the *workspace* (an ESN team) so several commercials can share
 * accounts, analyses and the knowledge base instead of each owning an isolated
 * silo. See `agent_docs/multi-user-workspaces.md` for the full design + phasing.
 *
 * This migration is deliberately backward-compatible: it only ADDS tables and a
 * nullable `workspace_id` column to the team-scoped tables, and backfills them.
 * NO existing query is changed here — every service still scopes by `user_id`,
 * so the live beta behaves identically. The `user_id → workspace_id` scoping
 * switch lands in Phase 2 (which also flips `workspace_id` to NOT NULL after a
 * re-backfill of any rows created in the gap).
 *
 * Backfill rule: one workspace per existing user (that user becomes its
 * `owner`), and every team-scoped row inherits its owner's workspace. All
 * inserts are idempotent (`WHERE NOT EXISTS` / `IF NOT EXISTS`) so a re-run is
 * safe.
 *
 * RLS is enabled as a defense-in-depth backstop only — the API connects as the
 * `postgres` superuser and the IA via `service_role`, both of which bypass RLS,
 * so these policies are not the primary barrier. The complete policy set aligned
 * on workspace membership lands in Phase 6.
 */

/** Team-scoped tables that gain a `workspace_id`. All confirmed to carry a
 *  `user_id UUID` column today. Personal tables (profiles, subscriptions,
 *  onboarding, esn_profiles, profile_context*) stay user-scoped for now. */
const SHARED_TABLES = [
  'accounts',
  'contacts',
  'attack_angles',
  'action_plans',
  'account_vocabulary',
  'chat_messages',
  'rag_documents',
  'crm_connections',
  'user_actions',
  'account_shares',
] as const

export class MultiUserWorkspaces1784000000000 implements MigrationInterface {
  public name = 'MultiUserWorkspaces1784000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. workspaces — the ESN team; owner is the billing/admin user.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL DEFAULT 'Mon espace',
        owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS workspaces_owner_user_id_idx ON workspaces (owner_user_id)`)

    // 2. workspace_members — membership + role. A user may belong to several.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
        created_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE (workspace_id, user_id)
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx ON workspace_members (user_id)`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS workspace_members_workspace_id_idx ON workspace_members (workspace_id)`,
    )

    // 3. workspace_invitations — invite by email, accept via opaque token.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_invitations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
        token TEXT NOT NULL UNIQUE,
        invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
        expires_at TIMESTAMPTZ NOT NULL,
        accepted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS workspace_invitations_workspace_id_idx ON workspace_invitations (workspace_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS workspace_invitations_email_idx ON workspace_invitations (lower(email))`,
    )
    // At most one pending invite per (workspace, email).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS workspace_invitations_pending_uq
        ON workspace_invitations (workspace_id, lower(email))
        WHERE status = 'pending'
    `)

    // 4. RLS backstop (see header — not the primary barrier).
    for (const table of ['workspaces', 'workspace_members', 'workspace_invitations']) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
    }
    await queryRunner.query(`DROP POLICY IF EXISTS "Members read their workspaces" ON workspaces`)
    await queryRunner.query(`
      CREATE POLICY "Members read their workspaces" ON workspaces FOR SELECT
        USING (id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    `)
    await queryRunner.query(`DROP POLICY IF EXISTS "Members read memberships" ON workspace_members`)
    await queryRunner.query(`
      CREATE POLICY "Members read memberships" ON workspace_members FOR SELECT
        USING (
          user_id = auth.uid()
          OR workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
        )
    `)
    await queryRunner.query(`DROP POLICY IF EXISTS "Members read invitations" ON workspace_invitations`)
    await queryRunner.query(`
      CREATE POLICY "Members read invitations" ON workspace_invitations FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    `)

    // 5. Backfill: one workspace per existing user + owner membership.
    await queryRunner.query(`
      INSERT INTO workspaces (name, owner_user_id)
      SELECT 'Mon espace', u.id
      FROM auth.users u
      WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.owner_user_id = u.id)
    `)
    await queryRunner.query(`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      SELECT w.id, w.owner_user_id, 'owner'
      FROM workspaces w
      WHERE NOT EXISTS (
        SELECT 1 FROM workspace_members m
        WHERE m.workspace_id = w.id AND m.user_id = w.owner_user_id
      )
    `)

    // 6. Add nullable workspace_id to each team-scoped table, backfill from the
    //    owner's workspace, and index it. Nullable in Phase 1 (rows created in
    //    the gap before Phase 2 may be null; Phase 2 re-backfills then NOT NULL).
    for (const table of SHARED_TABLES) {
      await queryRunner.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE`,
      )
      await queryRunner.query(`
        UPDATE ${table} t
        SET workspace_id = w.id
        FROM workspaces w
        WHERE t.workspace_id IS NULL AND w.owner_user_id = t.user_id
      `)
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS ${table}_workspace_id_idx ON ${table} (workspace_id)`)
    }
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
