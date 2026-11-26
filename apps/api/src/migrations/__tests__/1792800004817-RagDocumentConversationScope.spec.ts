import type { QueryRunner } from 'typeorm'
import { RagDocumentConversationScope1792800004817 } from '../1792800004817-RagDocumentConversationScope'

/** Capture every SQL statement the migration issues (no live DB needed) — same
 *  pattern as `1786970000000-RagWorkspaceScope.spec.ts`. */
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

describe('RagDocumentConversationScope1792800004817 — #1954.7', () => {
  it('adds `scope` (default workspace) and `conversation_id`, additively', async () => {
    const { runner, queries } = createRunner()
    await new RagDocumentConversationScope1792800004817().up(runner)
    const alter = queries.map(normalize).find(q => q.startsWith('ALTER TABLE rag_documents ADD COLUMN'))
    expect(alter).toBeDefined()
    expect(alter).toContain("ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'workspace'")
    expect(alter).toContain('ADD COLUMN IF NOT EXISTS conversation_id text')
  })

  it('constrains `scope` to exactly the two known values', async () => {
    const { runner, queries } = createRunner()
    await new RagDocumentConversationScope1792800004817().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_scope_check')
    const check = flat.find(q => q.includes('ADD CONSTRAINT rag_documents_scope_check'))
    expect(check).toBeDefined()
    expect(check).toContain("CHECK (scope IN ('workspace', 'conversation'))")
  })

  it('rejects `conversation` scope without a conversation_id, at the database', async () => {
    const { runner, queries } = createRunner()
    await new RagDocumentConversationScope1792800004817().up(runner)
    const flat = queries.map(normalize)
    const check = flat.find(q => q.includes('ADD CONSTRAINT rag_documents_conversation_scope_requires_id_check'))
    expect(check).toBeDefined()
    expect(check).toContain("CHECK (scope <> 'conversation' OR conversation_id IS NOT NULL)")
  })

  it('indexes conversation_id for the per-thread lookup', async () => {
    const { runner, queries } = createRunner()
    await new RagDocumentConversationScope1792800004817().up(runner)
    const idx = queries.map(normalize).find(q => q.includes('idx_rag_documents_conversation_id'))
    expect(idx).toBeDefined()
    expect(idx).toContain(
      'CREATE INDEX IF NOT EXISTS idx_rag_documents_conversation_id ON rag_documents (conversation_id)',
    )
    expect(idx).toContain('WHERE conversation_id IS NOT NULL')
  })

  it('excludes conversation-scoped rows from the pgvector RPC — a chat attachment never grounds a general search', async () => {
    const { runner, queries } = createRunner()
    await new RagDocumentConversationScope1792800004817().up(runner)
    const fn = queries.map(normalize).find(q => q.includes('CREATE OR REPLACE FUNCTION match_rag_documents'))
    expect(fn).toBeDefined()
    expect(fn).toContain("rd.scope = 'workspace'")
    // The workspace/owner-fallback predicate itself is untouched — same shape
    // as 1787950000000, only the scope filter is new.
    expect(fn).toContain('rd.workspace_id = filter_workspace_id')
    expect(fn).toContain('rd.workspace_id IS NULL AND rd.user_id = filter_user_id')
    expect(fn).toContain('ELSE FALSE')
  })

  it('re-grants EXECUTE (defensive — no DROP happens here, but the convention is kept)', async () => {
    const { runner, queries } = createRunner()
    await new RagDocumentConversationScope1792800004817().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('GRANT EXECUTE ON FUNCTION match_rag_documents TO authenticated')
    expect(flat).toContain('GRANT EXECUTE ON FUNCTION match_rag_documents TO service_role')
  })

  it('down() is unsupported, per repo convention', async () => {
    await expect(new RagDocumentConversationScope1792800004817().down()).rejects.toThrow(/not supported/i)
  })
})
