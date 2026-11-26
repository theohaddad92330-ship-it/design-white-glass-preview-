import type { QueryRunner } from 'typeorm'
import { RagDocumentArchivedExcludedFromRetrieval1796321507530 } from '../1796321507530-RagDocumentArchivedExcludedFromRetrieval'

/** Capture chaque instruction SQL (aucune base nécessaire) — même motif que
 *  `1796001543888-RagDocumentAccountScope.spec.ts`. */
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

async function run(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new RagDocumentArchivedExcludedFromRetrieval1796321507530().up(runner)
  return queries.map(normalize)
}

describe('RagDocumentArchivedExcludedFromRetrieval1796321507530 — #2431.5 (reste, épopée #2886)', () => {
  it('remplace la RPC vectorielle SANS changer sa signature (pas de DROP FUNCTION)', async () => {
    const flat = await run()
    expect(flat.some(q => q.startsWith('DROP FUNCTION'))).toBe(false)
    const fn = flat.find(q => q.includes('CREATE OR REPLACE FUNCTION match_rag_documents'))
    expect(fn).toBeDefined()
    expect(fn).toContain('filter_account_id uuid DEFAULT NULL')
  })

  it('exclut un document archivé de la récupération générale', async () => {
    const flat = await run()
    const fn = flat.find(q => q.includes('CREATE OR REPLACE FUNCTION match_rag_documents')) ?? ''
    expect(fn).toContain('rd.archived_at IS NULL')
  })

  it('conserve le cloisonnement de portée déjà posé (#2779)', async () => {
    const flat = await run()
    const fn = flat.find(q => q.includes('CREATE OR REPLACE FUNCTION match_rag_documents')) ?? ''
    expect(fn).toContain("rd.scope IN ('workspace', 'knowledge_base')")
    expect(fn).toContain("rd.scope = 'personal' AND rd.user_id = filter_user_id")
    expect(fn).toContain("rd.scope = 'account' AND filter_account_id IS NOT NULL AND rd.account_id = filter_account_id")
    expect(fn).toContain('rd.workspace_id = filter_workspace_id')
    expect(fn).toContain('ELSE FALSE')
  })

  it('rend EXECUTE aux deux rôles', async () => {
    const flat = await run()
    expect(flat).toContain('GRANT EXECUTE ON FUNCTION match_rag_documents TO authenticated')
    expect(flat).toContain('GRANT EXECUTE ON FUNCTION match_rag_documents TO service_role')
  })

  it('down() non supporté (convention du dépôt)', async () => {
    await expect(new RagDocumentArchivedExcludedFromRetrieval1796321507530().down()).rejects.toThrow(/not supported/i)
  })
})
