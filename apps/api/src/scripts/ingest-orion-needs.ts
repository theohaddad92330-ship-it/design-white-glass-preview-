import { createReadStream } from 'node:fs'
import { DATAFORGE_NEED_SOURCE_FILES, type DataforgeNeedSourceFile } from '@bellum/contracts'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import dataSource from '../database/data-source'
import { DataforgeNeedEntity } from '../database/entities/dataforge-need.entity'
import { createRecordAssembler, parseDataforgeHeader } from '../modules/dataforge/dataforge-csv'
import {
  describeOrionNeedHeader,
  parseOrionNeedRecord,
  type OrionNeedRecord,
} from '../modules/dataforge/orion-needs-csv'
import {
  attachNeedAccountByName,
  buildAccountNameIndex,
  buildCommonNameIndex,
  type AccountNameFiche,
  type CommonNameLink,
  type NeedAccountMatchTally,
} from '../modules/dataforge/orion-needs-account-match'

/**
 * #4281.1 / #4282.5 — ingestion des besoins historiques (ORION V12) — lancée
 * par l'OPÉRATEUR, une fois par fichier :
 *
 *   pnpm --filter @bellum/api ingest:orion-needs 24_MISSIONS_BESOINS /chemin/24_MISSIONS_BESOINS.csv
 *   pnpm --filter @bellum/api ingest:orion-needs 25_PIPELINE_CRM /chemin/25_PIPELINE_CRM_CREME_DE_LA_CREME.csv
 *
 * Idempotent : `ON CONFLICT (source_file, need_id)`. Imprime D'ABORD quelle
 * colonne nourrit quel champ et lesquelles restent brutes (`payload`) — une
 * colonne inattendue se voit avant la première écriture.
 *
 * #5185 — un besoin sans `account_id` est rattaché par le NOM de l'entreprise, sur correspondance EXACTE et UNIQUE
 * (hors fiche `est_doublon`) ; sinon il reste sans compte et le script le compte et le nomme.
 *
 * Lot 794 — à défaut, la clé de NOM du référentiel pivot `common_account_links` (noms et alias du pack v2.1, normalisés
 * comme la table), seulement si elle est univoque et désigne UNE fiche DF. Relancer le script RATTRAPE les besoins déjà
 * en base (upsert sur `(source_file, need_id)`) ; un `account_id` fourni par le fichier n'est jamais réécrit.
 */
const BATCH_SIZE = 200

async function main(): Promise<void> {
  const [sourceFileArg, csvPath] = process.argv.slice(2)
  if (!csvPath || !(DATAFORGE_NEED_SOURCE_FILES as readonly string[]).includes(sourceFileArg ?? '')) {
    console.error(`Usage: ingest-orion-needs <${DATAFORGE_NEED_SOURCE_FILES.join('|')}> <chemin du CSV>`)
    process.exitCode = 1
    return
  }
  const sourceFile = sourceFileArg as DataforgeNeedSourceFile

  await dataSource.initialize()
  const repo = dataSource.getRepository(DataforgeNeedEntity)

  const fiches: AccountNameFiche[] = (
    await dataSource.query(
      `SELECT d.source_id, d.name, d.normalized_name, d.legal_name,
              s.entreprise, s.company_normalized_name, s.legal_name AS status_legal_name,
              COALESCE(s.est_doublon, false) AS est_doublon
         FROM dataforge_accounts d
         LEFT JOIN dataforge_account_statuses s ON s.source_id = d.source_id`,
    )
  ).map((row: Record<string, string | boolean | null>): AccountNameFiche => ({
    sourceId: row.source_id as string,
    name: row.name as string | null,
    normalizedName: row.normalized_name as string | null,
    legalName: row.legal_name as string | null,
    statusNames: [row.entreprise, row.company_normalized_name, row.status_legal_name] as (string | null)[],
    estDoublon: row.est_doublon === true,
  }))
  const nameIndex = buildAccountNameIndex(fiches)
  // Lot 794 — les clés de nom du référentiel pivot (base commune ; table absente avant sa migration = aucun repli).
  const commonLinks: CommonNameLink[] = (
    await dataSource
      .query(
        `SELECT key_value, common_id, dataforge_source_id, group_account_id
           FROM common_account_links
          WHERE key_kind = 'name'`,
      )
      .catch((error: unknown) => {
        console.warn('Référentiel pivot illisible, aucun repli par clé commune :', error)
        return []
      })
  ).map((row: Record<string, string | null>): CommonNameLink => ({
    keyValue: row.key_value as string,
    commonId: row.common_id as string,
    dataforgeSourceId: row.dataforge_source_id,
    groupAccountId: row.group_account_id,
  }))
  const commonIndex = buildCommonNameIndex(commonLinks)
  const tally: NeedAccountMatchTally = {
    byId: 0,
    byName: 0,
    byCommonName: 0,
    commonOnly: 0,
    ambiguous: 0,
    notFound: 0,
    unmatchedNames: [],
  }

  let header: string[] | null = null
  let rows = 0
  const byStatus = new Map<string, number>()
  const rejected: string[] = []
  let batch: (OrionNeedRecord & { dataVersion: string })[] = []

  async function flush(): Promise<void> {
    if (batch.length === 0) return
    await repo.upsert(batch as QueryDeepPartialEntity<DataforgeNeedEntity>[], {
      conflictPaths: ['sourceFile', 'needId'],
      skipUpdateIfNoValuesChanged: true,
    })
    batch = []
  }

  function handleRecord(record: string): void {
    if (header === null) {
      header = parseDataforgeHeader(record)
      const { mapped, keptRaw } = describeOrionNeedHeader(header)
      console.log('Colonnes typées :', mapped)
      console.log(`Colonnes gardées brutes (payload) : ${keptRaw.join(', ') || 'aucune'}`)
      return
    }
    const parsed = parseOrionNeedRecord(header, record, sourceFile)
    if (parsed.kind === 'rejected') {
      rejected.push(parsed.reason)
      return
    }
    rows += 1
    byStatus.set(parsed.row.status, (byStatus.get(parsed.row.status) ?? 0) + 1)
    batch.push({ ...attachNeedAccountByName(parsed.row, nameIndex, tally, commonIndex), dataVersion: 'ORION_V12' })
  }

  const assembler = createRecordAssembler()
  for await (const chunk of createReadStream(csvPath, { encoding: 'utf8' })) {
    for (const record of assembler.push(chunk as string)) handleRecord(record)
    if (batch.length >= BATCH_SIZE) await flush()
  }
  const last = assembler.flush()
  if (last !== null) handleRecord(last)
  await flush()

  console.log(`Besoins ingérés (${sourceFile}) : ${rows}`)
  console.log('Répartition par statut :', Object.fromEntries(byStatus))
  console.log(
    `Rattachement compte : par identifiant ${tally.byId} · par nom ${tally.byName} · par référentiel commun ${tally.byCommonName} · reconnus sans fiche ${tally.commonOnly} · non rattachés ${tally.ambiguous + tally.notFound} (ambigus ${tally.ambiguous}, introuvables ${tally.notFound})`,
  )
  for (const name of tally.unmatchedNames.slice(0, 20)) console.log(`  · non rattaché : ${name}`)
  console.log(`Lignes écartées : ${rejected.length}`)
  for (const reason of rejected.slice(0, 20)) console.log(`  · ${reason}`)
  await dataSource.destroy()
}

void main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
