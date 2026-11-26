import { InternalKnowledgeStore } from './internal-knowledge.store'
import type { KnowledgeFileRow } from './internal-knowledge.types'

/** Faux DataSource qui refuse \u0000 comme Postgres (#3586). */
function fakeDataSource() {
  const calls: unknown[][] = []
  const query = jest.fn(async (_sql: string, params?: unknown[]) => {
    for (const p of params ?? []) {
      if (typeof p === 'string' && p.includes('\u0000')) {
        throw new Error('invalid byte sequence for encoding "UTF8": 0x00')
      }
    }
    calls.push(params ?? [])
    return []
  })
  const ds = {
    query,
    transaction: async <T>(fn: (m: { query: typeof query }) => Promise<T>) => fn({ query }),
  }
  return { ds, calls }
}

describe('InternalKnowledgeStore — \\u0000 (#3586)', () => {
  it('upsertFile : nom, chemin et message d’erreur sont normalisés', async () => {
    const { ds, calls } = fakeDataSource()
    const store = new InternalKnowledgeStore(ds as never)
    const row: KnowledgeFileRow = {
      fileId: 'f1',
      name: 'METHODE\u0000.pdf',
      mimeType: 'application/pdf',
      path: 'A / B\u0000 / METHODE.pdf',
      modifiedTime: '2026-01-01T00:00:00Z',
      status: 'error',
      errorMessage: 'échec\u0000 : x',
      chunkCount: 0,
      syncedAt: new Date(),
    }
    await expect(store.upsertFile(row)).resolves.toBeUndefined()
    expect(calls[0]).toContain('METHODE.pdf')
    expect(calls[0]).toContain('échec : x')
  })

  it('replaceChunks : titre, chemin et texte normalisés, longueur cohérente', async () => {
    const { ds, calls } = fakeDataSource()
    const store = new InternalKnowledgeStore(ds as never)
    const n = await store.replaceChunks(
      { fileId: 'f1', name: 'T\u0000itre', path: 'P\u0000', modifiedTime: 'm\u0000' },
      ['ab\u0000cd'],
    )
    expect(n).toBe(1)
    const insert = calls[1]
    expect(insert).toContain('abcd')
    expect(insert).toContain(4)
    expect(insert).toContain('Titre')
  })

  it('saveState et saveDigest : texte normalisé', async () => {
    const { ds } = fakeDataSource()
    const store = new InternalKnowledgeStore(ds as never)
    await expect(store.saveState({ lastError: 'x\u0000y' })).resolves.toBeUndefined()
    await expect(store.saveDigest({ content: 'a\u0000b', fingerprint: 'f' })).resolves.toBeUndefined()
  })
})
