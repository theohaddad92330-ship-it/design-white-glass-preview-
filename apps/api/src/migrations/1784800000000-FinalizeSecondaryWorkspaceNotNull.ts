import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Multi-user Phase 2 — finalize the SECONDARY team-scoped tables (write-path
 * lock-in, part 2).
 *
 * `FinalizeWorkspaceNotNull` (1784500000000) flipped the 5 primary tables
 * (`accounts`, `contacts`, `attack_angles`, `action_plans`,
 * `account_vocabulary`) to `workspace_id NOT NULL` but LEFT four nullable
 * because, at that audit time, the secondary-scoping PR (`feat/p2-scope-secondary`,
 * merged since) had not landed — so those modules' inserts did not yet stamp
 * `workspace_id`. They now do (re-audit in `agent_docs/multi-user-workspaces.md`
 * §"Phase 2 — Finalisation écritures (tables secondaires)"):
 *
 *   - `chat_messages`   — `ChatMessagesService.create` (stamped from the resolved
 *                         `workspaceId`; the `IaProxyController` resolves it).
 *   - `crm_connections` — `CrmService.upsertConnection` (HubSpot) AND
 *                         `SalesforceService.upsertConnection` (Salesforce) —
 *                         both resolve + stamp `workspace_id`.
 *   - `user_actions`    — `ActionsService.track` (controller resolves) AND
 *                         `AnalysisPersistence.recordAnalysisCompleted` (resolves
 *                         inline) — both stamp.
 *   - `account_shares`  — `AccountShareService.mintShareLink` (resolves inline).
 *
 * Every insert resolves via `WorkspaceContextService.resolveActiveWorkspace`,
 * which is fail-CLOSED (throws `ForbiddenException` when no workspace) — so a
 * `workspace_id NULL` can no longer be written to any of these four.
 *
 * `rag_documents` stays NULLABLE on purpose: it is written by the IA service
 * (FastAPI/PostgREST), never by NestJS, and that insert carries no
 * `workspace_id`. It is intentionally NOT touched here.
 *
 * Steps:
 *  1. Idempotent re-backfill of any residual NULL `workspace_id` from the row
 *     owner's workspace (harmless where already full).
 *  2. Flip `workspace_id` to NOT NULL on the four now-fully-stamped tables.
 *
 * Idempotent: the NULL-guarded UPDATE and (already-satisfied) NOT NULL flip both
 * no-op on a re-run. `down` unsupported (repo convention) — test `up` on a copy
 * before Railway.
 */

/** The four secondary tables whose every INSERT now provably stamps
 *  `workspace_id`. Each gets its residual NULLs re-backfilled then flipped
 *  NOT NULL. (`rag_documents` is deliberately excluded — IA-owned insert.) */
const SECONDARY_TABLES = ['chat_messages', 'crm_connections', 'user_actions', 'account_shares'] as const

export class FinalizeSecondaryWorkspaceNotNull1784800000000 implements MigrationInterface {
  public name = 'FinalizeSecondaryWorkspaceNotNull1784800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Re-backfill workspace_id from the row-owner's workspace for any row that
    //    predates its module's stamping (idempotent — only touches NULLs).
    for (const table of SECONDARY_TABLES) {
      await queryRunner.query(`
        UPDATE ${table} t
        SET workspace_id = w.id
        FROM workspaces w
        WHERE t.workspace_id IS NULL AND w.owner_user_id = t.user_id
      `)
    }

    // 2. Flip NOT NULL now that every insert stamps workspace_id. Fails loudly
    //    (correctly) if a residual NULL survived step 1.
    for (const table of SECONDARY_TABLES) {
      await queryRunner.query(`ALTER TABLE ${table} ALTER COLUMN workspace_id SET NOT NULL`)
    }
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
