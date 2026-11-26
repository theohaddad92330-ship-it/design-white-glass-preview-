import type { QueryRunner } from 'typeorm'
import { RagHnswIndexes1796541541000 } from '../1796541541000-RagHnswIndexes'

async function run(direction: 'up' | 'down'): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  await new RagHnswIndexes1796541541000()[direction](runner)
  return queries.map(sql => sql.replace(/\s+/g, ' ').trim())
}

const findSql = (flat: string[], needle: string): string => flat.find(q => q.includes(needle)) ?? ''

describe('RagHnswIndexes1796541541000 — audit IA M2', () => {
  it('remplace les deux ivfflat lists=100 par du HNSW cosinus (opérateur <=> des requêtes)', async () => {
    const flat = await run('up')
    for (const idx of ['rag_documents_embedding_idx', 'rag_document_chunks_embedding_idx']) {
      expect(flat).toContain(`DROP INDEX IF EXISTS ${idx}`)
      const create = findSql(flat, `CREATE INDEX IF NOT EXISTS ${idx}`)
      expect(create).toContain('USING hnsw (embedding extensions.vector_cosine_ops)')
      expect(create).not.toContain('ivfflat')
    }
    expect(flat.some(q => q.includes('ivfflat'))).toBe(false)
  })

  it('la RPC règle ef_search et le balayage itératif (avalé si pgvector < 0.8), prédicat inchangé', async () => {
    const fn = findSql(await run('up'), 'CREATE OR REPLACE FUNCTION match_rag_documents')
    expect(fn).toContain("set_config('hnsw.ef_search', '200', true)")
    expect(fn).toContain("set_config('hnsw.iterative_scan', 'strict_order', true)")
    expect(fn).toContain('EXCEPTION WHEN OTHERS THEN')
    expect(fn).toContain('rd.archived_at IS NULL')
    expect(fn).toContain("rd.scope IN ('workspace', 'knowledge_base')")
    expect(fn).toContain('ORDER BY rd.embedding <=> query_embedding')
  })

  it('down : ivfflat d’origine et RPC sans réglage', async () => {
    const flat = await run('down')
    expect(findSql(flat, 'rag_documents_embedding_idx ON')).toContain('USING ivfflat')
    expect(findSql(flat, 'rag_document_chunks_embedding_idx ON')).toContain('WITH (lists = 100)')
    expect(findSql(flat, 'CREATE OR REPLACE FUNCTION match_rag_documents')).not.toContain('hnsw.')
  })
})
