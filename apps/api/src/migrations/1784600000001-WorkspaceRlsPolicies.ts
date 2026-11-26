import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Multi-user Phase 6 — align RLS policies on WORKSPACE membership (backstop).
 *
 * Phase 1 enabled RLS on the team tables with per-user policies
 * (`USING (auth.uid() = user_id)`). Every team-scoped table now carries a
 * backfilled `workspace_id`, so this migration swaps those per-user policies for
 * workspace-membership policies: a user reaches a row iff they belong to the
 * row's workspace (`workspace_id IN (their memberships)`).
 *
 * This is a *defense-in-depth backstop only* — the NestJS API connects as the
 * `postgres` superuser (BYPASSRLS) and the IA via `service_role`, both of which
 * bypass RLS, so these policies are NOT the primary authorization barrier (that
 * lives in the service layer, scoped in Phase 2). It must be correct but is
 * low-risk. No application code, query, table or column changes here — policies
 * only, additive.
 *
 * NULL workspace_id: five tables are not workspace-scoped on the write path yet
 * (their INSERTs stamp only `user_id`), so a freshly-created row can have
 * `workspace_id IS NULL` — see `agent_docs/multi-user-workspaces.md` §"Phase 2 —
 * write-path audit" (chat_messages, crm_connections, user_actions, rag_documents
 * written by the IA, account_shares). For those we keep an owner fallback so the
 * row stays reachable by its creator:
 *   `... OR (workspace_id IS NULL AND user_id = auth.uid())`.
 *
 * account_shares: RLS was never enabled on it and it had no policy. Its public
 * slug read runs through the NestJS API (`SharePublicService` → TypeORM →
 * `postgres` superuser → BYPASSRLS), so enabling RLS + a workspace policy here
 * does NOT touch the public share path.
 *
 * Idempotent: `DROP POLICY IF EXISTS` (old names + the new name) then `CREATE`,
 * and `ENABLE ROW LEVEL SECURITY` is a no-op where already enabled. `down`
 * unsupported (repo convention) — test `up` on a copy before Railway.
 */

/** table → the exact existing per-user policy names to drop, taken verbatim from
 *  the earlier migrations. `accounts`/`contacts`/`attack_angles`/`action_plans`/
 *  `rag_documents` used a per-op quadruple (`<table>_<op>`, from Init +
 *  AuditFixes); the newer tables each used a single `FOR ALL` policy.
 *  `account_shares` never had a policy. */
const OLD_POLICIES: Record<string, string[]> = {
  accounts: ['accounts_select', 'accounts_insert', 'accounts_update', 'accounts_delete'],
  contacts: ['contacts_select', 'contacts_insert', 'contacts_update', 'contacts_delete'],
  attack_angles: ['attack_angles_select', 'attack_angles_insert', 'attack_angles_update', 'attack_angles_delete'],
  action_plans: ['action_plans_select', 'action_plans_insert', 'action_plans_update', 'action_plans_delete'],
  rag_documents: ['rag_documents_select', 'rag_documents_insert', 'rag_documents_update', 'rag_documents_delete'],
  account_vocabulary: ['Users can manage their own account vocabulary'],
  chat_messages: ['Users can manage their own chat messages'],
  crm_connections: ['Users can manage their own CRM connections'],
  user_actions: ['Users can manage their own actions'],
  account_shares: [],
}

/** `workspace_id` is guaranteed NOT NULL here (write-path audit stamps every
 *  insert — flipped to NOT NULL in 1784500000000). Plain membership predicate. */
const WORKSPACE_ONLY = ['accounts', 'contacts', 'attack_angles', 'action_plans', 'account_vocabulary'] as const

/** `workspace_id` may still be NULL here (module not workspace-scoped on the
 *  write path yet). Keep the owner fallback so the creator retains access. */
const WORKSPACE_OR_OWNER = [
  'chat_messages',
  'crm_connections',
  'user_actions',
  'rag_documents',
  'account_shares',
] as const

export class WorkspaceRlsPolicies1784600000001 implements MigrationInterface {
  public name = 'WorkspaceRlsPolicies1784600000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const memberOf = `workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())`
    const memberOrOwner = `(${memberOf} OR (workspace_id IS NULL AND user_id = auth.uid()))`

    const applyPolicy = async (table: string, predicate: string): Promise<void> => {
      // RLS must be ENABLED for the policy to bite. No-op where already enabled;
      // account_shares was never enabled — safe because its public slug read
      // bypasses RLS via the API superuser (see header).
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)

      // Drop the old per-user policies (names differ per table) + the new name,
      // so a re-run is idempotent.
      for (const name of OLD_POLICIES[table] ?? []) {
        await queryRunner.query(`DROP POLICY IF EXISTS "${name}" ON ${table}`)
      }
      await queryRunner.query(`DROP POLICY IF EXISTS "${table}_workspace_access" ON ${table}`)

      await queryRunner.query(`
        CREATE POLICY "${table}_workspace_access" ON ${table} FOR ALL
          USING (${predicate})
          WITH CHECK (${predicate})
      `)
    }

    for (const table of WORKSPACE_ONLY) {
      await applyPolicy(table, memberOf)
    }
    for (const table of WORKSPACE_OR_OWNER) {
      await applyPolicy(table, memberOrOwner)
    }
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
