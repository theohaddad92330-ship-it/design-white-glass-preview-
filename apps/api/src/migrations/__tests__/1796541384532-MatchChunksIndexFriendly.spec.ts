import type { QueryRunner } from 'typeorm'
import { MatchChunksIndexFriendly1796541384532 } from '../1796541384532-MatchChunksIndexFriendly'
import { MatchChunksFilterTypeChunk1796431312847 } from '../1796431312847-MatchChunksFilterTypeChunk'

/** Capture chaque instruction SQL (aucune base nécessaire) — même motif que `1796434817523-RagDocumentChunks.spec.ts`. */
async function run(
  direction: 'up' | 'down',
  migration: { up: (q: QueryRunner) => Promise<void>; down: (q: QueryRunner) => Promise<void> },
) {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  await migration[direction](runner)
  return queries.map(sql => sql.replace(/\s+/g, ' ').trim())
}

const fn = (flat: string[]): string => flat.find(q => q.includes('CREATE OR REPLACE FUNCTION')) ?? ''

describe('MatchChunksIndexFriendly1796541384532 — R10C-FIX, le RPC RAG ne balaie plus la table', () => {
  it('ordonne par distance DANS la sous-requête, avant seuil et LIMIT externes', async () => {
    const sql = fn(await run('up', new MatchChunksIndexFriendly1796541384532()))
    const inner = sql.indexOf('ORDER BY c.embedding <=> query_embedding LIMIT GREATEST(match_count * 4, 32)')
    const threshold = sql.indexOf('WHERE n.similarity > match_threshold')
    const outerLimit = sql.lastIndexOf('LIMIT match_count')
    expect(inner).toBeGreaterThan(-1)
    expect(threshold).toBeGreaterThan(inner)
    expect(outerLimit).toBeGreaterThan(threshold)
    // Le seuil n'est plus dans le WHERE interne (il empêchait l'usage de l'index).
    expect(sql.slice(0, inner)).not.toContain('> match_threshold')
  })

  it('recopie les clauses de sauvegarde et la signature MOT POUR MOT', async () => {
    const before = fn(await run('up', new MatchChunksFilterTypeChunk1796431312847()))
    const after = fn(await run('up', new MatchChunksIndexFriendly1796541384532()))
    for (const needle of [
      'c.embedding IS NOT NULL',
      'c.archived_at IS NULL',
      'filter_account_id IS NULL',
      'OR c.account_id = filter_account_id',
      'OR c.account_id IS NULL',
      "OR c.type_chunk = 'GARDE_FOU_QUALITE'",
      'AND (filter_type_chunk IS NULL OR c.type_chunk = filter_type_chunk)',
    ]) {
      expect(before).toContain(needle)
      expect(after).toContain(needle)
    }
    const sig = (s: string) => s.slice(s.indexOf('query_embedding extensions'), s.indexOf('RETURNS TABLE'))
    expect(sig(after)).toBe(sig(before))
  })

  it('crée un index HNSW cosinus (aucun n’existait)', async () => {
    const flat = await run('up', new MatchChunksIndexFriendly1796541384532())
    expect(flat.find(q => q.includes('hnsw'))).toContain(
      'CREATE INDEX IF NOT EXISTS dataforge_rag_chunks_embedding_hnsw_idx ON dataforge_rag_chunks USING hnsw (embedding extensions.vector_cosine_ops)',
    )
  })

  it('down() restaure la définition précédente mot pour mot et retire l’index', async () => {
    const down = await run('down', new MatchChunksIndexFriendly1796541384532())
    const previous = await run('up', new MatchChunksFilterTypeChunk1796431312847())
    expect(fn(down)).toBe(fn(previous))
    expect(down.some(q => q.includes('DROP INDEX IF EXISTS dataforge_rag_chunks_embedding_hnsw_idx'))).toBe(true)
  })
})
