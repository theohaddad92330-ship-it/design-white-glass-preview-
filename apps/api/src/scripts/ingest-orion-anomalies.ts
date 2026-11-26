import { createReadStream } from 'node:fs'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import dataSource from '../database/data-source'
import { DataforgeAnomalyEntity } from '../database/entities/dataforge-anomaly.entity'
import { createRecordAssembler, parseDataforgeHeader } from '../modules/dataforge/dataforge-csv'
import { parseOrionAnomalyRecord, type OrionAnomalyRecord } from '../modules/dataforge/orion-csv'
import { ORION_KNOWN_ANOMALY_CODES } from '../modules/dataforge/orion-v12-headers.fixture'

/**
 * Ingestion de `6_QUALITE/60_ANOMALIES_ET_CORRECTIONS.csv` (ORION_DATAPACK_V12)
 * — lancée par l'OPÉRATEUR :
 *
 *   pnpm --filter @bellum/api ingest:orion-anomalies /chemin/vers/60_ANOMALIES_ET_CORRECTIONS.csv
 *
 * Idempotent : `ON CONFLICT (anomalie_id)`.
 *
 * ⚠️ Ce registre n'est PAS de la documentation : chaque anomalie ingérée ici
 * DOIT avoir son miroir `type_chunk = GARDE_FOU_QUALITE` dans
 * `dataforge_rag_chunks` (ingéré séparément par `ingest-orion-rag-chunks`) —
 * c'est ce miroir qui la rend lisible depuis une recherche produit. Le script
 * avertit si un code connu manque du côté RAG, sans jamais bloquer
 * l'ingestion : les deux fichiers s'ingèrent indépendamment et dans n'importe
 * quel ordre.
 */
const BATCH_SIZE = 50

async function main(): Promise<void> {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('Usage: ingest-orion-anomalies <chemin du CSV 60_ANOMALIES_ET_CORRECTIONS.csv>')
    process.exitCode = 1
    return
  }

  await dataSource.initialize()
  const repo = dataSource.getRepository(DataforgeAnomalyEntity)

  let header: string[] | null = null
  let rows = 0
  const seenCodes = new Set<string>()
  const bySeverite = new Map<string, number>()
  const rejected: string[] = []
  let batch: (OrionAnomalyRecord & { dataVersion: string })[] = []

  async function flush(): Promise<void> {
    if (batch.length === 0) return
    await repo.upsert(batch as QueryDeepPartialEntity<DataforgeAnomalyEntity>[], {
      conflictPaths: ['anomalieId'],
      skipUpdateIfNoValuesChanged: true,
    })
    batch = []
  }

  function handleRecord(record: string): void {
    if (header === null) {
      header = parseDataforgeHeader(record)
      return
    }
    const parsed = parseOrionAnomalyRecord(header, record)
    if (parsed.kind === 'rejected') {
      rejected.push(parsed.reason)
      return
    }
    rows += 1
    seenCodes.add(parsed.row.code)
    bySeverite.set(parsed.row.severite, (bySeverite.get(parsed.row.severite) ?? 0) + 1)
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

  console.log(`Anomalies ingérées: ${rows}`)
  console.log('Répartition par sévérité:', Object.fromEntries(bySeverite))
  const missingFromKnownList = [...seenCodes].filter(code => !ORION_KNOWN_ANOMALY_CODES.includes(code))
  if (missingFromKnownList.length > 0) {
    console.log(
      `⚠️ ${missingFromKnownList.length} code(s) absent(s) du registre mesuré (ORION_KNOWN_ANOMALY_CODES) — ` +
        `probablement une version du pack postérieure à V12 : ${missingFromKnownList.join(', ')}`,
    )
  }
  const missingFromPack = ORION_KNOWN_ANOMALY_CODES.filter(code => !seenCodes.has(code))
  if (missingFromPack.length > 0) {
    console.log(
      `⚠️ ${missingFromPack.length} code(s) attendu(s) mais absent(s) du fichier: ${missingFromPack.join(', ')}`,
    )
  }
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
