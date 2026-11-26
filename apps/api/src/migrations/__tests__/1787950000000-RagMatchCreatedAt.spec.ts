import type { QueryRunner } from 'typeorm'
import { RagMatchCreatedAt1787950000000 } from '../1787950000000-RagMatchCreatedAt'

/** Capture every SQL statement the migration issues (no live DB needed). */
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

describe('RagMatchCreatedAt1787950000000', () => {
  it('returns the document’s real date, the only thing the copilot may date a source with', async () => {
    const { runner, queries } = createRunner()
    await new RagMatchCreatedAt1787950000000().up(runner)
    const fn = queries.map(normalize).find(q => q.includes('CREATE OR REPLACE FUNCTION match_rag_documents'))
    expect(fn).toBeDefined()
    expect(fn).toContain('created_at timestamptz')
    expect(fn).toContain('rd.created_at')
  })

  it('drops the previous signature first — a new output column changes the return type', async () => {
    const { runner, queries } = createRunner()
    await new RagMatchCreatedAt1787950000000().up(runner)
    const normalized = queries.map(normalize)
    const dropIndex = normalized.findIndex(q => q.startsWith('DROP FUNCTION IF EXISTS match_rag_documents'))
    const createIndex = normalized.findIndex(q => q.includes('CREATE OR REPLACE FUNCTION match_rag_documents'))
    expect(dropIndex).toBeGreaterThanOrEqual(0)
    expect(createIndex).toBeGreaterThan(dropIndex)
    // Same 5-arg signature as 1786970000000 — this is a replacement, not an overload.
    expect(normalized.some(q => q.includes('match_rag_documents(vector, float, int, uuid, uuid)'))).toBe(true)
  })

  it('keeps the tenant scope predicate exactly as it was — it fails closed', async () => {
    const { runner, queries } = createRunner()
    await new RagMatchCreatedAt1787950000000().up(runner)
    const fn = queries.map(normalize).find(q => q.includes('CREATE OR REPLACE FUNCTION match_rag_documents'))
    expect(fn).toContain('rd.workspace_id = filter_workspace_id')
    expect(fn).toContain('rd.workspace_id IS NULL AND rd.user_id = filter_user_id')
    // No scope resolved → nothing is retrieved, ever.
    expect(fn).toContain('ELSE FALSE')
  })

  it('down() is unsupported, per repo convention', async () => {
    await expect(new RagMatchCreatedAt1787950000000().down()).rejects.toThrow('down migrations are not supported')
  })
})
