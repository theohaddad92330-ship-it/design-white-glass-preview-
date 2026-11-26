import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Make RAG grounding a TEAM asset: workspace-scoped retrieval.
 *
 * The defect (PR #637 §1.2): an ESN uploads its references, case studies and offer
 * descriptions into « Connaissances », the whole team sees them listed — and no
 * colleague's analysis ever grounds on them. `apps/ia` had no notion of workspace,
 * so it both READ and WROTE `rag_documents` by `user_id` alone
 * (`rag_service.py`). The knowledge base was shared at display time only, which
 * guts its value for exactly the customer the product targets.
 *
 * Direction of the bug, established before writing this migration: retrieval was
 * scoped to `user_id` — strictly NARROWER than the workspace. There was no
 * cross-workspace leak; colleagues' documents were simply invisible. This
 * migration therefore WIDENS a scope, which is why every step below is explicit
 * about what becomes visible to whom.
 *
 * Three steps:
 *
 *  1. **Backfill `workspace_id` on legacy rows.** The column has existed (and been
 *     backfilled once) since `1784500000000`, but the IA insert never stamped it,
 *     so every document ingested SINCE that migration carries NULL. Those rows are
 *     invisible even in `RagService.listForWorkspace` (which filters strictly on
 *     `workspace_id`) — i.e. a user's own upload disappeared from their own
 *     Connaissances list. We re-derive from the owner, in two unambiguous passes.
 *
 *  2. **Teach `match_rag_documents` the workspace.** The pgvector RPC only knew
 *     `filter_user_id`. Scoping only the full-text backend would leak the moment
 *     `EMBEDDING_API_KEY` is set, so both paths move together.
 *
 *  3. **Close the unscoped branch.** The old predicate was
 *     `(filter_user_id IS NULL OR rd.user_id = filter_user_id)` — a call that
 *     omitted the filter scanned EVERY tenant. No caller does (rag_service always
 *     passes it), but the footgun is removed: an unscoped call now returns nothing.
 *
 * **What happens to pre-existing rows** (the "nothing orphaned, nothing widened"
 * contract):
 *
 *   - Pass 1 assigns the workspace the owner OWNS. This mirrors
 *     `WorkspaceContextService.resolveActiveWorkspace` (owned first) and the
 *     established backfill in `1784500000000`, so a row lands exactly where the
 *     rest of the product already assumes it lives. Since `1784500000000` installs
 *     a signup trigger giving every user an owned workspace, this covers ~all rows.
 *   - Pass 2 handles a user who owns NO workspace but belongs to exactly ONE:
 *     that membership is the only possible answer, so it is a derivation, not a
 *     guess.
 *   - **Anything still NULL is deliberately left NULL.** A user who owns nothing
 *     and belongs to several workspaces has no determinable home for the document.
 *     Per the "never invent data" rule it is NOT assigned to a plausible
 *     workspace: it stays reachable by its owner alone, through the owner fallback
 *     that both the RLS policy (`rag_documents_workspace_access`, migration
 *     `1784600000001`) and the service filter (`rag_service._scope`) carry. This
 *     is why the column is NOT flipped to NOT NULL.
 *
 * **Owner has since moved workspaces.** `resolveActiveWorkspace` returns the OWNED
 * workspace, not the most recently joined one, so a user invited into a second
 * workspace still reads and writes through the one they own. Pass 1 therefore
 * matches live behaviour rather than relocating their documents to a workspace
 * they merely joined — which would expose an individual's older uploads to a team
 * that never had access to them. Documents follow ownership, not the latest
 * invitation.
 *
 * **RLS is untouched and stays enforced.** `rag_documents_workspace_access` is
 * already a workspace-membership predicate with an owner fallback for NULLs; it
 * needs no change and gets none. The service filter installed alongside this
 * migration is character-for-character the same predicate, so the application can
 * never read wider than the database backstop.
 *
 * Idempotent: the NULL-guarded UPDATEs and `CREATE OR REPLACE` all no-op on a
 * re-run. `down` unsupported (repo convention) — test `up` on a copy before Railway.
 */
export class RagWorkspaceScope1786970000000 implements MigrationInterface {
  public name = 'RagWorkspaceScope1786970000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1a. Derive the workspace from the row owner's OWNED workspace — the same
    //     rule `resolveActiveWorkspace` applies, and the same one `1784500000000`
    //     used for the first backfill. Only touches NULLs.
    await queryRunner.query(`
      UPDATE rag_documents t
      SET workspace_id = w.id
      FROM workspaces w
      WHERE t.workspace_id IS NULL AND w.owner_user_id = t.user_id
    `)

    // 1b. Owner owns no workspace but belongs to exactly ONE: unambiguous, so it
    //     is a derivation rather than a guess. A user with several memberships and
    //     no ownership is left NULL on purpose (see header) — never assigned to a
    //     plausible workspace.
    await queryRunner.query(`
      UPDATE rag_documents t
      SET workspace_id = m.workspace_id
      FROM workspace_members m
      WHERE t.workspace_id IS NULL
        AND m.user_id = t.user_id
        AND (SELECT COUNT(*) FROM workspace_members m2 WHERE m2.user_id = t.user_id) = 1
    `)

    // 2. The pgvector RPC gains the workspace filter. Adding a parameter changes
    //    the signature, so CREATE OR REPLACE would OVERLOAD rather than replace —
    //    leaving the old 4-arg version callable and making a 4-named-arg call
    //    ambiguous. Drop the old signature first.
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS match_rag_documents(extensions.vector, float, int, uuid)
    `)
    await queryRunner.query(`DROP FUNCTION IF EXISTS match_rag_documents(vector, float, int, uuid)`)

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION match_rag_documents(
        query_embedding vector(1536),
        match_threshold float DEFAULT 0.7,
        match_count int DEFAULT 5,
        filter_user_id uuid DEFAULT NULL,
        filter_workspace_id uuid DEFAULT NULL
      )
      RETURNS TABLE (
        id uuid,
        title text,
        content text,
        category text,
        similarity float
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY
        SELECT
          rd.id,
          rd.title,
          rd.content,
          rd.category,
          1 - (rd.embedding <=> query_embedding) AS similarity
        FROM rag_documents rd
        WHERE
          rd.embedding IS NOT NULL
          AND 1 - (rd.embedding <=> query_embedding) > match_threshold
          AND (
            CASE
              -- Team scope: the workspace's documents, whoever uploaded them, plus
              -- the caller's own legacy rows that predate workspace stamping.
              -- Mirrors the RLS policy rag_documents_workspace_access exactly.
              WHEN filter_workspace_id IS NOT NULL THEN
                rd.workspace_id = filter_workspace_id
                OR (rd.workspace_id IS NULL AND rd.user_id = filter_user_id)
              -- No workspace resolved: legacy per-user scope, unchanged.
              WHEN filter_user_id IS NOT NULL THEN
                rd.user_id = filter_user_id
              -- 3. Fail closed. The previous predicate returned EVERY tenant's
              -- documents when the filter was omitted; nothing may be retrieved
              -- without a scope.
              ELSE FALSE
            END
          )
        ORDER BY rd.embedding <=> query_embedding
        LIMIT match_count;
      END;
      $$
    `)

    await queryRunner.query(`GRANT EXECUTE ON FUNCTION match_rag_documents TO authenticated`)
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION match_rag_documents TO service_role`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
