import { createReadStream } from 'node:fs'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import dataSource from '../database/data-source'
import { DataforgeRagChunkEntity } from '../database/entities/dataforge-rag-chunk.entity'
import { createRecordAssembler, parseDataforgeHeader } from '../modules/dataforge/dataforge-csv'
import { parseOrionRagChunkRecord, type OrionRagChunkRecord } from '../modules/dataforge/orion-csv'
import { ORION_QUALITY_GUARD_CHUNK_TYPE } from '../modules/dataforge/orion-v12-headers.fixture'

/**
 * Ingestion de `5_RAG/50_CHUNKS_INDEXABLES.csv` (ORION_DATAPACK_V12) — lancée
 * par l'OPÉRATEUR, jamais par l'application (le pack est gitignoré, 172 Mo au
 * total, il reste chez Louis) :
 *
 *   pnpm --filter @bellum/api ingest:orion-rag-chunks /chemin/vers/50_CHUNKS_INDEXABLES.csv
 *
 * Idempotent : `ON CONFLICT (chunk_id)` — rejouer ne duplique rien.
 *
 * ⚠️ N'APPELLE JAMAIS l'API d'embedding. `EMBEDDING_API_KEY` reste le seul
 * interrupteur des vecteurs (voir `agent_docs/env-reference.md`) et vit côté
 * IA : ce script ingère le TEXTE, `apps/ia` calcule les vecteurs en tâche de
 * fond dès que la clé existe (`backfill_dataforge_rag_chunk_embeddings`).
 * Sans elle : zéro appel réseau, chemin byte-identique.
 */
const BATCH_SIZE = 500

async function main(): Promise<void> {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('Usage: ingest-orion-rag-chunks <chemin du CSV 50_CHUNKS_INDEXABLES.csv>')
    process.exitCode = 1
    return
  }

  await dataSource.initialize()
  const repo = dataSource.getRepository(DataforgeRagChunkEntity)

  let header: string[] | null = null
  let rows = 0
  let guardFouRows = 0
  const rejected: string[] = []
  let batch: (OrionRagChunkRecord & { dataVersion: string })[] = []

  async function flush(): Promise<void> {
    if (batch.length === 0) return
    await repo.upsert(batch as QueryDeepPartialEntity<DataforgeRagChunkEntity>[], {
      conflictPaths: ['chunkId'],
      skipUpdateIfNoValuesChanged: true,
    })
    batch = []
  }

  function handleRecord(record: string): void {
    if (header === null) {
      header = parseDataforgeHeader(record)
      return
    }
    const parsed = parseOrionRagChunkRecord(header, record)
    if (parsed.kind === 'rejected') {
      rejected.push(parsed.reason)
      return
    }
    rows += 1
    if (parsed.row.typeChunk === ORION_QUALITY_GUARD_CHUNK_TYPE) guardFouRows += 1
    batch.push({ ...parsed.row, dataVersion: 'ORION_V12' })
  }

  const assembler = createRecordAssembler()
  const stream = createReadStream(csvPath, { encoding: 'utf8' })
  for await (const chunk of stream) {
    for (const record of assembler.push(chunk as string)) handleRecord(record)
    if (batch.length >= BATCH_SIZE) await flush()
  }
  const last = assembler.flush()
  if (last !== null) handleRecord(last)
  await flush()

  console.log(`Chunks ingérés: ${rows} (dont ${guardFouRows} GARDE_FOU_QUALITE — attendu: 20)`)
  if (rejected.length > 0) {
    console.log(`Lignes écartées: ${rejected.length} — premières raisons :`)
    for (const reason of rejected.slice(0, 20)) console.log(`  · ${reason}`)
  } else {
    console.log('Lignes écartées: 0')
  }
  await dataSource.destroy()
}

void main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
