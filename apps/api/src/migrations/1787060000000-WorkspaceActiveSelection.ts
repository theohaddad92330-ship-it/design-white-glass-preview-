import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `workspace_active_selections` — the workspace a user is currently working in.
 *
 * The defect this closes: signup provisions a personal workspace for every user
 * (`handle_new_user_workspace`, migration 1784500000000). `resolveActiveWorkspace`
 * returned the OWNED workspace first, unconditionally — so a user who already had
 * an account and accepted an ESN's invitation got a correct `workspace_members`
 * row and then kept seeing their own empty space. The invitation worked; the
 * *landing* did not. Membership was already many-to-many; only the persisted
 * choice of which membership is active was missing.
 *
 * Purely additive: no existing row is touched, no column changes on any table.
 * A user with no row here resolves exactly as before, so the migration is a
 * no-op for every account until someone actually switches.
 *
 * `ON DELETE CASCADE` on both FKs: deleting a workspace or a user removes their
 * selections rather than leaving a pointer to a row that no longer exists.
 * Note this is only belt-and-braces — the resolver re-proves membership on every
 * read and ignores (then clears) a stale selection regardless.
 */
export class WorkspaceActiveSelection1787060000000 implements MigrationInterface {
  public name = 'WorkspaceActiveSelection1787060000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_active_selections (
        user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        updated_at   timestamptz NOT NULL DEFAULT now()
      )
    `)

    // RLS backstop, on the model of migration 1784600000000. The API runs as
    // `postgres` (BYPASSRLS) so the service layer stays the primary barrier —
    // but a preference row is per-user data and gets a per-user policy.
    await queryRunner.query(`ALTER TABLE workspace_active_selections ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP POLICY IF EXISTS workspace_active_selections_own ON workspace_active_selections`)
    await queryRunner.query(`
      CREATE POLICY workspace_active_selections_own ON workspace_active_selections
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (
        auth.uid() = user_id
        -- A user may only point at a workspace they actually belong to. The
        -- service layer asserts this too; stating it here means even a direct
        -- PostgREST write cannot park someone in a team they never joined.
        AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
      )
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
