import { DataSource } from 'typeorm'
import { OrionV12Staging1791510000000 } from '../../migrations/1791510000000-OrionV12Staging'
import { OrionRagChunksVectorSearch1791510100000 } from '../../migrations/1791510100000-OrionRagChunksVectorSearch'
import { InternalKnowledgeDriveSync1796431247953 } from '../../migrations/1796431247953-InternalKnowledgeDriveSync'
import { MatchChunksFilterTypeChunk1796431312847 } from '../../migrations/1796431312847-MatchChunksFilterTypeChunk'

/**
 * #3586 W3 — le filtre de type de `match_dataforge_rag_chunks` exercé contre un VRAI Postgres + pgvector.
 *
 * Sauté tant que `INTERNAL_KNOWLEDGE_TEST_DATABASE_URL` n'est pas posée (la CI n'a pas de base jetable).
 * En local : `scripts/test-internal-knowledge-filter-sql.sh` (conteneur `pgvector/pgvector:pg16` détruit en sortie).
 * La base visée est VIDÉE de la table `dataforge_rag_chunks` : jamais une base qui compte.
 */
const TEST_DATABASE_URL = process.env.INTERNAL_KNOWLEDGE_TEST_DATABASE_URL
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip
if (!TEST_DATABASE_URL) {
  console.warn(
    'internal-knowledge.match-filter.integration: SKIP — INTERNAL_KNOWLEDGE_TEST_DATABASE_URL absente (aucune base de test fournie).',
  )
}

/** Vecteur unité sur `axis`, plus `tilt` sur l'axe 1 : plus `tilt` est grand, plus il s'éloigne de l'axe 0. */
const vec = (tilt: number): string => {
  const v = new Array<number>(1536).fill(0)
  v[0] = 1
  v[1] = tilt
  return `[${v.join(',')}]`
}

describeIfDb('match_dataforge_rag_chunks — filtre de type (#3586 W3)', () => {
  let ds: DataSource

  const match = async (filterType: string | null, count = 6): Promise<string[]> =>
    (
      (await ds.query(`SELECT chunk_id FROM match_dataforge_rag_chunks($1::extensions.vector, 0.5, $2, NULL, $3)`, [
        vec(0),
        count,
        filterType,
      ])) as Array<{ chunk_id: string }>
    ).map(r => r.chunk_id)

  beforeAll(async () => {
    ds = new DataSource({
      type: 'postgres',
      url: TEST_DATABASE_URL,
      extra: { options: '-c search_path=public,extensions' },
    })
    await ds.initialize()
    await ds.query(`CREATE SCHEMA IF NOT EXISTS extensions`)
    await ds.query(`CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions`)
    for (const role of ['authenticated', 'service_role']) {
      await ds.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role}; END IF; END $$`,
      )
    }
    await ds.query(`DROP TABLE IF EXISTS internal_knowledge_files, internal_knowledge_sync_state CASCADE`)
    await ds.query(`DROP TABLE IF EXISTS dataforge_rag_chunks CASCADE`)
    await ds.query(`DROP FUNCTION IF EXISTS match_dataforge_rag_chunks CASCADE`)
    const runner = ds.createQueryRunner()
    try {
      await new OrionV12Staging1791510000000().up(runner)
      await new OrionRagChunksVectorSearch1791510100000().up(runner)
      await new InternalKnowledgeDriveSync1796431247953().up(runner)
      await new MatchChunksFilterTypeChunk1796431312847().up(runner)
    } finally {
      await runner.release()
    }
    // 50 chunks ORION TRÈS proches de la requête (tilt ~0), 1 chunk Drive plus loin (tilt 0.5, encore > seuil 0.5).
    for (let i = 0; i < 50; i += 1) {
      await ds.query(
        `INSERT INTO dataforge_rag_chunks (data_version, chunk_id, account_id, type_chunk, texte, priorite_indexation, embedding)
         VALUES ('orion', $1, 'DF-1', 'ENTREPRISE', 'orion', 1, $2::extensions.vector)`,
        [`orion-${i}`, vec(i / 10000)],
      )
    }
    await ds.query(
      `INSERT INTO dataforge_rag_chunks (data_version, chunk_id, account_id, type_chunk, texte, priorite_indexation, embedding)
       VALUES ('drive', 'drive-1', NULL, 'DRIVE_INTERNE', 'savoir', 1, $1::extensions.vector)`,
      [vec(0.5)],
    )
  })

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy()
  })

  it('sans filtre (NULL) : comportement inchangé — les ORION surclassent le Drive, top-6 sans Drive', async () => {
    const ids = await match(null)
    expect(ids).toHaveLength(6)
    expect(ids).not.toContain('drive-1')
    expect(ids.every(id => id.startsWith('orion-'))).toBe(true)
  })

  it('avec filter_type_chunk = DRIVE_INTERNE : le chunk Drive remonte malgré 50 ORION plus proches', async () => {
    expect(await match('DRIVE_INTERNE')).toEqual(['drive-1'])
  })

  it('un type sans chunk rend une liste vide, et le filtre ne mord pas sur les garde-fous si on ne le demande pas', async () => {
    expect(await match('TYPE_INEXISTANT')).toEqual([])
  })

  it("l'ancienne surcharge à 4 arguments n'existe plus (pas d'ambiguïté PostgREST)", async () => {
    const rows = (await ds.query(
      `SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'match_dataforge_rag_chunks'`,
    )) as Array<{ n: number }>
    expect(rows[0]?.n).toBe(1)
  })

  it('down : rétablit la surcharge à 4 arguments, up la remplace de nouveau', async () => {
    const runner = ds.createQueryRunner()
    try {
      await new MatchChunksFilterTypeChunk1796431312847().down(runner)
      const old = (await ds.query(
        `SELECT pronargs::int AS n FROM pg_proc WHERE proname = 'match_dataforge_rag_chunks'`,
      )) as Array<{ n: number }>
      expect(old.map(r => r.n)).toEqual([4])
      await new MatchChunksFilterTypeChunk1796431312847().up(runner)
      const neu = (await ds.query(
        `SELECT pronargs::int AS n FROM pg_proc WHERE proname = 'match_dataforge_rag_chunks'`,
      )) as Array<{ n: number }>
      expect(neu.map(r => r.n)).toEqual([5])
    } finally {
      await runner.release()
    }
  })
})
