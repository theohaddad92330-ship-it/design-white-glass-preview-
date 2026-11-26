import { DataSource } from 'typeorm'
import { OrionV12Staging1791510000000 } from '../../migrations/1791510000000-OrionV12Staging'
import { OrionRagChunksVectorSearch1791510100000 } from '../../migrations/1791510100000-OrionRagChunksVectorSearch'
import { InternalKnowledgeDriveSync1796431247953 } from '../../migrations/1796431247953-InternalKnowledgeDriveSync'
import { InternalKnowledgeReconciledAt1796431275281 } from '../../migrations/1796431275281-InternalKnowledgeReconciledAt'
import { InternalKnowledgeStore } from './internal-knowledge.store'

/**
 * #3586 limite 2 — le SQL du stockage exercé contre un VRAI Postgres + pgvector (pas un faux).
 *
 * Sauté (skip motivé) tant que `INTERNAL_KNOWLEDGE_TEST_DATABASE_URL` n'est pas posée : la CI ne dispose pas
 * de cette base jetable. En local : `scripts/test-internal-knowledge-sql.sh` lance un conteneur
 * `pgvector/pgvector:pg16`, passe l'URL à ce fichier puis détruit le conteneur.
 * La base visée est VIDÉE de ses tables de l'essai : ne jamais la pointer vers une base qui compte.
 */
const TEST_DATABASE_URL = process.env.INTERNAL_KNOWLEDGE_TEST_DATABASE_URL
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip
if (!TEST_DATABASE_URL) {
  console.warn(
    'internal-knowledge.store.integration: SKIP — INTERNAL_KNOWLEDGE_TEST_DATABASE_URL absente (aucune base de test fournie).',
  )
}

const unitVector = (axis: number): string => {
  const v = new Array<number>(1536).fill(0)
  v[axis] = 1
  return `[${v.join(',')}]`
}

describeIfDb('InternalKnowledgeStore — SQL réel (#3586)', () => {
  let ds: DataSource
  let store: InternalKnowledgeStore

  const live = async (fileId: string): Promise<number> =>
    Number(
      (
        (await ds.query(
          `SELECT count(*)::int AS n FROM dataforge_rag_chunks WHERE drive_file_id = $1 AND archived_at IS NULL`,
          [fileId],
        )) as Array<{ n: number }>
      )[0]?.n,
    )
  const total = async (fileId: string): Promise<number> =>
    Number(
      (
        (await ds.query(`SELECT count(*)::int AS n FROM dataforge_rag_chunks WHERE drive_file_id = $1`, [
          fileId,
        ])) as Array<{
          n: number
        }>
      )[0]?.n,
    )
  const embedAll = async (fileId: string): Promise<void> => {
    await ds.query(`UPDATE dataforge_rag_chunks SET embedding = $2::extensions.vector WHERE drive_file_id = $1`, [
      fileId,
      unitVector(0),
    ])
  }
  const matched = async (): Promise<string[]> =>
    (
      (await ds.query(`SELECT chunk_id FROM match_dataforge_rag_chunks($1::extensions.vector, 0.5, 50, NULL)`, [
        unitVector(0),
      ])) as Array<{
        chunk_id: string
      }>
    ).map(r => r.chunk_id)

  beforeAll(async () => {
    // Supabase met `extensions` dans le search_path : sans lui, l'opérateur `<=>` de pgvector est introuvable.
    ds = new DataSource({
      type: 'postgres',
      url: TEST_DATABASE_URL,
      extra: { options: '-c search_path=public,extensions' },
    })
    await ds.initialize()
    // Prérequis posés par Supabase en prod (schéma `extensions`, rôles d'API) — absents d'un Postgres nu.
    await ds.query(`CREATE SCHEMA IF NOT EXISTS extensions`)
    await ds.query(`CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions`)
    for (const role of ['authenticated', 'service_role']) {
      await ds.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role}; END IF; END $$`,
      )
    }
    await ds.query(`DROP TABLE IF EXISTS internal_knowledge_files, internal_knowledge_sync_state CASCADE`)
    await ds.query(`DROP TABLE IF EXISTS dataforge_rag_chunks CASCADE`)
    const runner = ds.createQueryRunner()
    try {
      await new OrionV12Staging1791510000000().up(runner)
      await new OrionRagChunksVectorSearch1791510100000().up(runner)
      await new InternalKnowledgeDriveSync1796431247953().up(runner)
      await new InternalKnowledgeReconciledAt1796431275281().up(runner)
    } finally {
      await runner.release()
    }
    store = new InternalKnowledgeStore(ds)
  })

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy()
  })

  it('la migration rejouée est idempotente (IF NOT EXISTS partout)', async () => {
    const runner = ds.createQueryRunner()
    try {
      await new InternalKnowledgeDriveSync1796431247953().up(runner)
      await new InternalKnowledgeReconciledAt1796431275281().up(runner)
    } finally {
      await runner.release()
    }
  })

  it('insertion : replaceChunks pose les chunks vivants avec leur source Drive', async () => {
    const n = await store.replaceChunks(
      { fileId: 'f1', name: 'CERVEAU', path: 'Partagé / CERVEAU', modifiedTime: '2026-10-04T08:00:00.000Z' },
      ['premier', 'second'],
    )
    expect(n).toBe(2)
    expect(await live('f1')).toBe(2)
    const rows = (await ds.query(
      `SELECT chunk_id, type_chunk, drive_path, drive_modified_time, account_id FROM dataforge_rag_chunks WHERE drive_file_id = 'f1' ORDER BY chunk_id`,
    )) as Array<Record<string, unknown>>
    expect(rows.map(r => r.chunk_id)).toEqual([
      'drive:f1:2026-10-04T08:00:00.000Z:0',
      'drive:f1:2026-10-04T08:00:00.000Z:1',
    ])
    expect(rows[0]).toMatchObject({ type_chunk: 'DRIVE_INTERNE', drive_path: 'Partagé / CERVEAU', account_id: null })
  })

  it('réindexation idempotente (fileId + modifiedTime) : rejouer ne duplique rien', async () => {
    const file = { fileId: 'f1', name: 'CERVEAU', path: 'Partagé / CERVEAU', modifiedTime: '2026-10-04T08:00:00.000Z' }
    await store.replaceChunks(file, ['premier', 'second'])
    await store.replaceChunks(file, ['premier', 'second'])
    expect(await total('f1')).toBe(2)
    expect(await live('f1')).toBe(2)
  })

  it('fichier modifié : les anciens chunks sont ARCHIVÉS (jamais supprimés), les neufs vivants', async () => {
    await store.replaceChunks(
      { fileId: 'f1', name: 'CERVEAU', path: 'Partagé / CERVEAU', modifiedTime: '2026-10-04T09:00:00.000Z' },
      ['v2'],
    )
    expect(await total('f1')).toBe(3)
    expect(await live('f1')).toBe(1)
    const archived = (await ds.query(
      `SELECT count(*)::int AS n FROM dataforge_rag_chunks WHERE drive_file_id = 'f1' AND archived_at IS NOT NULL`,
    )) as Array<{ n: number }>
    expect(archived[0]?.n).toBe(2)
  })

  it('archivage : archiveChunks archive les chunks vivants, sans rien supprimer', async () => {
    await store.archiveChunks('f1')
    expect(await live('f1')).toBe(0)
    expect(await total('f1')).toBe(3)
  })

  it('désarchivage : rejouer le même fichier (revenu dans la portée) ré-active ses chunks, sans doublon', async () => {
    await store.replaceChunks(
      { fileId: 'f1', name: 'CERVEAU', path: 'Partagé / CERVEAU', modifiedTime: '2026-10-04T09:00:00.000Z' },
      ['v2'],
    )
    expect(await live('f1')).toBe(1)
    expect(await total('f1')).toBe(3)
  })

  it("match_dataforge_rag_chunks n'expose plus un chunk archivé, et sert toujours un chunk ORION sans archived_at", async () => {
    await ds.query(
      `INSERT INTO dataforge_rag_chunks (data_version, chunk_id, account_id, type_chunk, texte, priorite_indexation, embedding)
       VALUES ('orion', 'orion-1', NULL, 'GARDE_FOU_QUALITE', 'garde-fou', 0, $1::extensions.vector)`,
      [unitVector(0)],
    )
    await embedAll('f1')
    const liveChunk = 'drive:f1:2026-10-04T09:00:00.000Z:0'
    expect(await matched()).toEqual(expect.arrayContaining([liveChunk, 'orion-1']))

    await store.archiveChunks('f1')
    const afterArchive = await matched()
    expect(afterArchive).not.toContain(liveChunk)
    expect(afterArchive).toContain('orion-1')
    // Aucun chunk d'une ancienne version archivée ne sort non plus (leur embedding existe encore ou non).
    expect(afterArchive.filter(id => id.startsWith('drive:f1:'))).toEqual([])
  })

  it("l'état de synchro (jeton, dernière réconciliation) fait l'aller-retour en base", async () => {
    expect(await store.getState()).toEqual({
      pageToken: null,
      lastRunAt: null,
      lastStatus: null,
      lastError: null,
      lastReconciledAt: null,
    })
    const at = new Date('2026-10-05T01:00:00.000Z')
    await store.saveState({
      pageToken: 'tok-9',
      lastRunAt: at,
      lastStatus: 'ok',
      lastError: null,
      lastReconciledAt: at,
    })
    await store.saveState({ lastStatus: 'error', lastError: 'boom' })
    expect(await store.getState()).toEqual({
      pageToken: 'tok-9',
      lastRunAt: at,
      lastStatus: 'error',
      lastError: 'boom',
      lastReconciledAt: at,
    })
  })

  it('un fichier connu : upsert puis relecture, statut contraint par le CHECK', async () => {
    const row = {
      fileId: 'f1',
      name: 'CERVEAU',
      mimeType: 'application/vnd.google-apps.document',
      path: 'Partagé / CERVEAU',
      modifiedTime: '2026-10-04T09:00:00.000Z',
      status: 'indexed' as const,
      errorMessage: null,
      chunkCount: 1,
      syncedAt: new Date('2026-10-05T01:00:00.000Z'),
    }
    await store.upsertFile(row)
    await store.upsertFile({ ...row, status: 'archived', chunkCount: 0 })
    expect(await store.getFile('f1')).toMatchObject({ status: 'archived', chunkCount: 0 })
    await expect(store.upsertFile({ ...row, status: 'bogus' as never })).rejects.toThrow()
  })
})
