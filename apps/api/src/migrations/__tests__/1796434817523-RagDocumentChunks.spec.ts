import type { QueryRunner } from 'typeorm'
import { RagDocumentChunks1796434817523 } from '../1796434817523-RagDocumentChunks'

/** Capture chaque instruction SQL (aucune base nécessaire) — même motif que
 *  `1796321507530-RagDocumentArchivedExcludedFromRetrieval.spec.ts`. */
async function run(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  await new RagDocumentChunks1796434817523().up(runner)
  return queries.map(sql => sql.replace(/\s+/g, ' ').trim())
}

const findSql = (flat: string[], needle: string): string => flat.find(q => q.includes(needle)) ?? ''

describe('RagDocumentChunks1796434817523 — #3750, les morceaux citables d’un document', () => {
  it('crée la table, rattachée au document parent par une cascade', async () => {
    const table = findSql(await run(), 'CREATE TABLE IF NOT EXISTS rag_document_chunks')
    expect(table).toContain('document_id uuid NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE')
    expect(table).toContain('user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE')
    expect(table).toContain('workspace_id uuid NULL REFERENCES workspaces(id) ON DELETE CASCADE')
    expect(table).toContain('unit_label text NOT NULL DEFAULT')
    // Même dimension que `rag_documents.embedding` (migration Init).
    expect(table).toContain('embedding extensions.vector(1536)')
    expect(table).toContain('search tsvector GENERATED ALWAYS AS')
    expect(table).toContain('UNIQUE (document_id, chunk_index)')
  })

  it('pose la RLS de rag_documents — même prédicat espace OU auteur', async () => {
    const flat = await run()
    expect(flat).toContain('ALTER TABLE rag_document_chunks ENABLE ROW LEVEL SECURITY')
    const policy = findSql(flat, 'CREATE POLICY "rag_document_chunks_workspace_access"')
    expect(policy).toContain('FOR ALL')
    expect(policy).toContain(
      'workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()) OR (workspace_id IS NULL AND user_id = auth.uid())',
    )
  })

  it('indexe le vecteur comme rag_documents, et le plein texte', async () => {
    const flat = await run()
    expect(findSql(flat, 'rag_document_chunks_embedding_idx')).toContain(
      'USING ivfflat (embedding extensions.vector_cosine_ops)',
    )
    expect(findSql(flat, 'rag_document_chunks_search_idx')).toContain('USING gin (search)')
  })

  it('la recherche applique EXACTEMENT la visibilité de match_rag_documents', async () => {
    const fn = findSql(await run(), 'CREATE OR REPLACE FUNCTION search_rag_document_chunks')
    expect(fn).toContain('JOIN rag_documents rd ON rd.id = c.document_id')
    expect(fn).toContain('rd.archived_at IS NULL')
    expect(fn).toContain("rd.scope IN ('workspace', 'knowledge_base')")
    expect(fn).toContain("rd.scope = 'personal' AND rd.user_id = filter_user_id")
    expect(fn).toContain("rd.scope = 'account' AND filter_account_id IS NOT NULL AND rd.account_id = filter_account_id")
    expect(fn).toContain('rd.workspace_id = filter_workspace_id')
    expect(fn).toContain('ELSE FALSE')
    // Sans vecteur : le plein texte, jamais une recherche vide.
    expect(fn).toContain("c.search @@ websearch_to_tsquery('french', query_text)")
  })

  it('le rattrapage ne lit que les documents longs SANS morceau, par petit lot', async () => {
    const fn = findSql(await run(), 'CREATE OR REPLACE FUNCTION rag_documents_pending_chunks')
    expect(fn).toContain('length(rd.content) > min_chars')
    expect(fn).toContain('NOT EXISTS (SELECT 1 FROM rag_document_chunks c WHERE c.document_id = rd.id)')
    expect(fn).toContain('LIMIT batch_size')
  })

  it('down() non supporté (convention du dépôt)', async () => {
    await expect(new RagDocumentChunks1796434817523().down()).rejects.toThrow(/not supported/i)
  })
})
