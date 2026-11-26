import type { QueryRunner } from 'typeorm'
import { RagWorkspaceScope1786970000000 } from '../1786970000000-RagWorkspaceScope'

/** Capture every SQL statement the migration issues (no live DB needed). The
 *  behavioural counterpart runs against a real Postgres in the `.db.spec.ts`
 *  sibling. */
function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

describe('RagWorkspaceScope1786970000000', () => {
  it('backfills workspace_id from the owner’s OWNED workspace, touching only NULLs', async () => {
    const { runner, queries } = createRunner()
    await new RagWorkspaceScope1786970000000().up(runner)
    const backfill = queries.map(normalize).find(q => q.includes('FROM workspaces w'))
    expect(backfill).toBeDefined()
    expect(backfill).toContain('UPDATE rag_documents t SET workspace_id = w.id')
    expect(backfill).toContain('w.owner_user_id = t.user_id')
    // Never rewrites a row that already has a workspace.
    expect(backfill).toContain('t.workspace_id IS NULL')
  })

  it('falls back to a SOLE membership, and only a sole one (a derivation, not a guess)', async () => {
    const { runner, queries } = createRunner()
    await new RagWorkspaceScope1786970000000().up(runner)
    const pass2 = queries.map(normalize).find(q => q.includes('FROM workspace_members m'))
    expect(pass2).toBeDefined()
    expect(pass2).toContain('SET workspace_id = m.workspace_id')
    expect(pass2).toContain('t.workspace_id IS NULL')
    // The count guard is what keeps an ambiguous owner NULL rather than assigning
    // them a plausible workspace.
    expect(pass2).toMatch(/COUNT\(\*\)\s+FROM workspace_members m2 WHERE m2\.user_id = t\.user_id\)\s*=\s*1/)
  })

  it('never flips workspace_id to NOT NULL — indeterminable rows stay owner-private', async () => {
    const { runner, queries } = createRunner()
    await new RagWorkspaceScope1786970000000().up(runner)
    expect(queries.map(normalize).some(q => /ALTER COLUMN workspace_id SET NOT NULL/.test(q))).toBe(false)
  })

  it('drops the old 4-arg RPC before recreating it (adding a param would OVERLOAD, not replace)', async () => {
    const { runner, queries } = createRunner()
    await new RagWorkspaceScope1786970000000().up(runner)
    const flat = queries.map(normalize)
    expect(flat.some(q => q.startsWith('DROP FUNCTION IF EXISTS match_rag_documents('))).toBe(true)
    const dropIdx = flat.findIndex(q => q.startsWith('DROP FUNCTION IF EXISTS match_rag_documents('))
    const createIdx = flat.findIndex(q => q.includes('CREATE OR REPLACE FUNCTION match_rag_documents'))
    expect(dropIdx).toBeGreaterThanOrEqual(0)
    expect(createIdx).toBeGreaterThan(dropIdx)
  })

  it('scopes the RPC to the workspace, with an owner fallback mirroring the RLS policy', async () => {
    const { runner, queries } = createRunner()
    await new RagWorkspaceScope1786970000000().up(runner)
    const fn = queries.map(normalize).find(q => q.includes('CREATE OR REPLACE FUNCTION match_rag_documents'))
    expect(fn).toBeDefined()
    expect(fn).toContain('filter_workspace_id uuid DEFAULT NULL')
    expect(fn).toContain('rd.workspace_id = filter_workspace_id')
    // Legacy NULL rows stay reachable by their owner — nothing is orphaned.
    expect(fn).toContain('rd.workspace_id IS NULL AND rd.user_id = filter_user_id')
  })

  it('fails CLOSED with no scope — the old predicate returned every tenant’s documents', async () => {
    const { runner, queries } = createRunner()
    await new RagWorkspaceScope1786970000000().up(runner)
    const fn = queries.map(normalize).find(q => q.includes('CREATE OR REPLACE FUNCTION match_rag_documents'))
    expect(fn).toContain('ELSE FALSE')
    // The removed branch: `filter_user_id IS NULL OR rd.user_id = filter_user_id`
    // made an unscoped call a full-table scan across every workspace.
    expect(fn).not.toContain('filter_user_id IS NULL OR')
  })

  it('re-grants EXECUTE after the drop (a dropped function loses its grants)', async () => {
    const { runner, queries } = createRunner()
    await new RagWorkspaceScope1786970000000().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('GRANT EXECUTE ON FUNCTION match_rag_documents TO authenticated')
    expect(flat).toContain('GRANT EXECUTE ON FUNCTION match_rag_documents TO service_role')
  })

  it('down() is unsupported, per repo convention', async () => {
    await expect(new RagWorkspaceScope1786970000000().down()).rejects.toThrow(/not supported/i)
  })
})
