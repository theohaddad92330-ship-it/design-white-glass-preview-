import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Multi-user Phase 2 — finalize workspace scoping (write-path lock-in).
 *
 * By now the team-scoped READS switched from `user_id` to `workspace_id`
 * (`accounts`, `contacts`, `attack_angles`, `action_plans`, `account_vocabulary`,
 * `rag_documents`) and every INSERT into those stamps `workspace_id`. This
 * migration closes the loop:
 *
 *  1. Guarantee EVERY user owns a workspace. Phase 1 backfilled the users that
 *     existed then, but there was NO trigger creating one for NEW signups —
 *     so `resolveActiveWorkspace` threw for them and Phase-2 reads/writes broke.
 *     We add `on_auth_user_created_workspace` (mirrors the existing
 *     `handle_new_user_credits` trigger) + an idempotent safety-net backfill.
 *  2. Re-backfill `workspace_id` on any row created in the Phase-1→Phase-2 gap
 *     (before its module started stamping), keyed on the owner's workspace.
 *  3. Flip `workspace_id` to NOT NULL — but ONLY on the tables whose EVERY
 *     insert provably stamps it (write-path audit, see
 *     `agent_docs/multi-user-workspaces.md` §"Phase 2 — write-path audit").
 *
 * Left NULLABLE on purpose (their modules are not workspace-scoped yet, so their
 * inserts do NOT stamp `workspace_id` — flipping them would fail live INSERTs):
 *   - `chat_messages`   — `ChatMessagesService.create` stamps only `user_id`.
 *   - `crm_connections` — `CrmService.upsertConnection` stamps only `user_id`.
 *   - `user_actions`    — `ActionsService.track` stamps only `user_id`.
 *   - `account_shares`  — `AccountShareService.mintShareLink` stamps only `user_id`.
 *   - `rag_documents`   — written by the IA service (FastAPI/PostgREST), never by
 *                         NestJS; the IA insert carries no `workspace_id`.
 * These get their re-backfill (step 2) so they are ready to flip once their
 * modules are scoped (tracked on `feat/p2-scope-secondary`).
 *
 * Idempotent: `CREATE OR REPLACE`, `WHERE NOT EXISTS`, `ON CONFLICT DO NOTHING`,
 * and the NULL-guarded UPDATE all no-op on a re-run. `down` unsupported (repo
 * convention) — test `up` on a copy before Railway.
 */

/** Every team-scoped table gets its NULLs re-backfilled (harmless where already
 *  full). Order-independent. */
const RE_BACKFILL_TABLES = [
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

/** ONLY the tables whose every INSERT stamps `workspace_id` (write-path audit).
 *  Flipping any other table would break a live INSERT. */
const NOT_NULL_TABLES = ['accounts', 'contacts', 'attack_angles', 'action_plans', 'account_vocabulary'] as const

export class FinalizeWorkspaceNotNull1784500000000 implements MigrationInterface {
  public name = 'FinalizeWorkspaceNotNull1784500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1a. Auto-provision a workspace (+ owner membership) for every NEW user.
    //     SECURITY DEFINER + pinned search_path so it runs correctly under the
    //     Supabase `supabase_auth_admin` role that owns `auth.users` inserts —
    //     same shape as `handle_new_user` / `handle_new_user_credits`.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION handle_new_user_workspace()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, auth, extensions
      AS $$
      DECLARE
        new_workspace_id UUID;
      BEGIN
        INSERT INTO workspaces (owner_user_id, name)
        SELECT NEW.id, 'Mon espace'
        WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.owner_user_id = NEW.id)
        RETURNING id INTO new_workspace_id;

        IF new_workspace_id IS NOT NULL THEN
          INSERT INTO workspace_members (workspace_id, user_id, role)
          VALUES (new_workspace_id, NEW.id, 'owner')
          ON CONFLICT (workspace_id, user_id) DO NOTHING;
        END IF;
        RETURN NEW;
      END;
      $$
    `)
    await queryRunner.query(`DROP TRIGGER IF EXISTS on_auth_user_created_workspace ON auth.users`)
    await queryRunner.query(`
      CREATE TRIGGER on_auth_user_created_workspace
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION handle_new_user_workspace()
    `)

    // 1b. Safety net: any existing user still without a workspace gets one now
    //     (idempotent — covers users created between Phase 1 and this migration).
    await queryRunner.query(`
      INSERT INTO workspaces (owner_user_id, name)
      SELECT u.id, 'Mon espace'
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

    // 2. Re-backfill workspace_id from the row-owner's workspace for any row that
    //    predates its module's stamping (idempotent — only touches NULLs).
    for (const table of RE_BACKFILL_TABLES) {
      await queryRunner.query(`
        UPDATE ${table} t
        SET workspace_id = w.id
        FROM workspaces w
        WHERE t.workspace_id IS NULL AND w.owner_user_id = t.user_id
      `)
    }

    // 3. Flip NOT NULL ONLY where the write-path audit proves every insert stamps
    //    workspace_id. Fails loudly (correctly) if a residual NULL survived step 2.
    for (const table of NOT_NULL_TABLES) {
      await queryRunner.query(`ALTER TABLE ${table} ALTER COLUMN workspace_id SET NOT NULL`)
    }
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
