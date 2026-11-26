import { createReadStream } from 'node:fs'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import dataSource from '../database/data-source'
import { DataforgeAccountStatusEntity } from '../database/entities/dataforge-account-status.entity'
import { createRecordAssembler, parseDataforgeHeader } from '../modules/dataforge/dataforge-csv'
import { parseOrionAccountStatusRecord, toAccountStatusUpsertRow } from '../modules/dataforge/orion-csv'

/**
 * Ingestion de `1_COMPTES/10_COMPTES_MASTER.csv` (ORION_DATAPACK_V12) — lancée
 * par l'OPÉRATEUR :
 *
 *   pnpm --filter @bellum/api ingest:orion-accounts /chemin/vers/10_COMPTES_MASTER.csv
 *
 * Idempotent : `ON CONFLICT (source_id)`. Le compte du pack (`account_id`,
 * `DF-XXXX`) partage son espace avec `dataforge_accounts.source_id` — vérifié
 * le 31/08/2026 (Société Générale = DF-0001 des deux côtés) — mais SANS
 * contrainte FK : ce script s'exécute seul, avant ou sans jamais lancer
 * `ingest:dataforge` sur le CSV V10 brut à 158 colonnes.
 */
const BATCH_SIZE = 200

async function main(): Promise<void> {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('Usage: ingest-orion-accounts-master <chemin du CSV 10_COMPTES_MASTER.csv>')
    process.exitCode = 1
    return
  }

  await dataSource.initialize()
  const repo = dataSource.getRepository(DataforgeAccountStatusEntity)

  let header: string[] | null = null
  let rows = 0
  const byStatutCode = new Map<string, number>()
  const rejected: string[] = []
  let batch: ReturnType<typeof toAccountStatusUpsertRow>[] = []

  async function flush(): Promise<void> {
    if (batch.length === 0) return
    await repo.upsert(batch as QueryDeepPartialEntity<DataforgeAccountStatusEntity>[], {
      conflictPaths: ['sourceId'],
      skipUpdateIfNoValuesChanged: true,
    })
    batch = []
  }

  function handleRecord(record: string): void {
    if (header === null) {
      header = parseDataforgeHeader(record)
      return
    }
    const parsed = parseOrionAccountStatusRecord(header, record)
    if (parsed.kind === 'rejected') {
      rejected.push(parsed.reason)
      return
    }
    rows += 1
    byStatutCode.set(parsed.row.statutCode, (byStatutCode.get(parsed.row.statutCode) ?? 0) + 1)
    batch.push(toAccountStatusUpsertRow(parsed.row))
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

  console.log(`Comptes ingérés: ${rows}`)
  console.log('Répartition par statut_code:')
  for (const [code, n] of [...byStatutCode.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  · ${code}: ${n}`)
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
