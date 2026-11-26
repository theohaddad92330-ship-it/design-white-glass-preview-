import type { QueryRunner } from 'typeorm'
import { RAG_DOCUMENT_SCOPES } from '@bellum/contracts'
import { RagDocumentAccountScope1796001543888 } from '../1796001543888-RagDocumentAccountScope'

/** Capture chaque instruction SQL (aucune base nécessaire) — même motif que
 *  `1792800004817-RagDocumentConversationScope.spec.ts`. */
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
  await new RagDocumentAccountScope1796001543888().up(runner)
  return queries.map(normalize)
}

describe('RagDocumentAccountScope1796001543888 — #2779', () => {
  it('ajoute `account_id` (nullable, additif)', async () => {
    const flat = await run()
    expect(flat).toContain('ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS account_id uuid')
  })

  it('élargit `rag_documents_scope_check` aux cinq portées du contrat, AVANT le code qui écrit', async () => {
    const flat = await run()
    const check = flat.find(q => q.includes('ADD CONSTRAINT rag_documents_scope_check'))
    expect(check).toContain("CHECK (scope IN ('workspace', 'conversation', 'personal', 'account', 'knowledge_base'))")
    for (const scope of RAG_DOCUMENT_SCOPES) expect(check).toContain(`'${scope}'`)
  })

  it('refuse un document `account` sans compte, en base', async () => {
    const flat = await run()
    const check = flat.find(q => q.includes('ADD CONSTRAINT rag_documents_account_scope_requires_id_check'))
    expect(check).toContain("CHECK (scope <> 'account' OR account_id IS NOT NULL)")
  })

  it('remplace la RPC vectorielle : ancienne signature retirée, `filter_account_id` ajouté', async () => {
    const flat = await run()
    expect(flat).toContain('DROP FUNCTION IF EXISTS match_rag_documents(vector, float, int, uuid, uuid)')
    const fn = flat.find(q => q.includes('CREATE OR REPLACE FUNCTION match_rag_documents'))
    expect(fn).toContain('filter_account_id uuid DEFAULT NULL')
  })

  it('la RPC ne rend un document `account` QUE pour SON compte, et un `personal` QUE pour son auteur', async () => {
    const flat = await run()
    const fn = flat.find(q => q.includes('CREATE OR REPLACE FUNCTION match_rag_documents')) ?? ''
    expect(fn).toContain("rd.scope IN ('workspace', 'knowledge_base')")
    expect(fn).toContain("rd.scope = 'personal' AND rd.user_id = filter_user_id")
    expect(fn).toContain("rd.scope = 'account' AND filter_account_id IS NOT NULL AND rd.account_id = filter_account_id")
    // Jamais `conversation` : seul `fetch_documents_by_ids` le lit.
    expect(fn).not.toContain("'conversation'")
    // Le cloisonnement par espace est intact.
    expect(fn).toContain('rd.workspace_id = filter_workspace_id')
    expect(fn).toContain('ELSE FALSE')
  })

  it('rend EXECUTE aux deux rôles', async () => {
    const flat = await run()
    expect(flat).toContain('GRANT EXECUTE ON FUNCTION match_rag_documents TO authenticated')
    expect(flat).toContain('GRANT EXECUTE ON FUNCTION match_rag_documents TO service_role')
  })

  it('down() non supporté (convention du dépôt)', async () => {
    await expect(new RagDocumentAccountScope1796001543888().down()).rejects.toThrow(/not supported/i)
  })
})
