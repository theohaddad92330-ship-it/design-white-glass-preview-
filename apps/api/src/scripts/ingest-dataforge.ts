import { createReadStream } from 'node:fs'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import dataSource from '../database/data-source'
import { DataforgeAccountEntity } from '../database/entities/dataforge-account.entity'
import { DataforgeAccountDomainEntity } from '../database/entities/dataforge-account-domain.entity'
import { classifyDataforgeHeader, createColumnAudit } from '../modules/dataforge/dataforge-columns'
import {
  createRecordAssembler,
  parseDataforgeHeader,
  parseDataforgeRecord,
  type DataforgeAccountRecord,
  type DataforgeDomainRecord,
} from '../modules/dataforge/dataforge-csv'

/**
 * Ingestion du CSV canonique DATAFORGE V10 — lancé par l'OPÉRATEUR, jamais par
 * l'application (345 Mo, le fichier n'est pas commité ; il reste chez Louis) :
 *
 *   pnpm --filter @bellum/api ingest:dataforge /chemin/vers/DATAFORGE_V10_..._.csv
 *
 * Idempotent : rejouer le script ne duplique rien (`ON CONFLICT` sur
 * `(source_id)` côté comptes, `(source_id, domain_code, data_version)` côté
 * domaines) et n'écrase JAMAIS une résolution SIREN déjà faite — un SIREN
 * existant gagne toujours sur un SIREN absent du fichier.
 *
 * Le fichier est STREAMÉ (chunks → assembleur d'enregistrements) : ~400 champs
 * cités contiennent des retours à la ligne, une lecture ligne à ligne casserait.
 * Chaque refus du parseur est COMPTÉ et les premiers sont montrés — une ligne
 * écartée en silence est la version ingestion du « 0 » qui ment.
 */
const BATCH_SIZE = 500

/**
 * Ce que l'ingestion a VU des colonnes — et ce qu'elle a écarté, nommé et
 * compté.
 *
 * Le 29/08/2026, dix-huit colonnes sur 158 tombaient parce que le filtre de
 * préfixes datait de la V9. Rien ne le disait : ni un rejet, ni un compteur, ni
 * une ligne de journal. Un filtre silencieux se lit « il n'y avait rien » — ce
 * bloc-ci est la réponse la moins chère à ce défaut-là.
 */
function reportColumns(header: string[] | null, audit: ReturnType<typeof createColumnAudit> | null): void {
  if (!header || !audit) {
    console.log('Colonnes: aucun en-tête lu (fichier vide ?)')
    return
  }
  const shape = classifyDataforgeHeader(header)
  console.log(
    `Colonnes: ${header.length} — typées ${shape.typed.length}, payload compte ${shape.accountPayload.length}, ` +
      `payload domaine ${shape.domainPayload.length}, écartées ${shape.discarded.length}, inconnues ${shape.unknown.length}`,
  )
  const report = audit.report()
  for (const entry of report.discarded) {
    console.log(`  · ${entry.column} — ${entry.nonEmptyRows} cellules non vides — ${entry.reason}`)
    if (entry.contradictions > 0) {
      // La raison de l'écart ne tient plus : le pack a changé sous elle.
      console.log(
        `    ⚠️  ${entry.contradictions} lignes CONTREDISENT cette raison — la relire avant de rejouer l'ingestion.`,
      )
    }
  }
  if (report.unknown.length > 0) {
    console.log(`Colonnes INCONNUES du registre: ${report.unknown.length} — à classer, jamais à jeter :`)
    for (const entry of report.unknown) {
      console.log(`  · ${entry.column} — ${entry.nonEmptyRows} cellules non vides`)
    }
  } else {
    console.log('Colonnes inconnues du registre: 0')
  }
}

async function main(): Promise<void> {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('Usage: ingest-dataforge <chemin du CSV canonique>')
    process.exitCode = 1
    return
  }

  await dataSource.initialize()
  const accountsRepo = dataSource.getRepository(DataforgeAccountEntity)
  const domainsRepo = dataSource.getRepository(DataforgeAccountDomainEntity)

  // Les SIREN déjà résolus en base gagnent sur le fichier (jamais dégradés).
  const existing = new Map<
    string,
    { siren: string | null; resolutionStatus: string; resolutionReason: string | null }
  >()
  for (const row of await accountsRepo.find({
    select: ['sourceId', 'siren', 'resolutionStatus', 'resolutionReason'],
  })) {
    existing.set(row.sourceId, {
      siren: row.siren,
      resolutionStatus: row.resolutionStatus,
      resolutionReason: row.resolutionReason,
    })
  }

  const accounts = new Map<string, DataforgeAccountRecord>()
  const rejected: string[] = []
  let header: string[] | null = null
  let audit: ReturnType<typeof createColumnAudit> | null = null
  let rows = 0
  let domainBatch: DataforgeDomainRecord[] = []

  async function flushDomains(): Promise<void> {
    if (domainBatch.length === 0) return
    await domainsRepo.upsert(domainBatch as QueryDeepPartialEntity<DataforgeAccountDomainEntity>[], {
      conflictPaths: ['sourceId', 'domainCode', 'dataVersion'],
      skipUpdateIfNoValuesChanged: true,
    })
    domainBatch = []
  }

  function handleRecord(record: string): void {
    if (header === null) {
      header = parseDataforgeHeader(record)
      audit = createColumnAudit(header)
      return
    }
    const parsed = parseDataforgeRecord(header, record)
    if (parsed.kind === 'rejected') {
      rejected.push(parsed.reason)
      return
    }
    audit?.observe(parsed.raw)
    rows += 1
    if (!accounts.has(parsed.account.sourceId)) accounts.set(parsed.account.sourceId, parsed.account)
    domainBatch.push(parsed.domain)
  }

  const assembler = createRecordAssembler()
  const stream = createReadStream(csvPath, { encoding: 'utf8' })
  for await (const chunk of stream) {
    for (const record of assembler.push(chunk as string)) handleRecord(record)
    if (domainBatch.length >= BATCH_SIZE) await flushDomains()
  }
  const last = assembler.flush()
  if (last !== null) handleRecord(last)
  await flushDomains()

  // Les comptes en dernier : leurs colonnes sont identiques sur les 66 lignes,
  // la première occurrence suffit. Un SIREN déjà en base n'est jamais écrasé.
  let sirenFromPack = 0
  const payload = [...accounts.values()].map(record => {
    const known = existing.get(record.sourceId)
    const siren = known?.siren ?? record.siren
    const resolutionStatus =
      known && known.resolutionStatus !== 'pending' ? known.resolutionStatus : record.siren ? 'resolved' : 'pending'
    if (!known?.siren && record.siren) sirenFromPack += 1
    // Une raison de résolution DÉJÀ écrite (registre) n'est jamais écrasée par
    // une ré-ingestion — `undefined` dans un lot mixte redeviendrait DEFAULT
    // au `ON CONFLICT DO UPDATE`, c'est-à-dire `null` en silence.
    const resolutionReason =
      known && known.resolutionStatus !== 'pending'
        ? known.resolutionReason
        : record.siren
          ? 'SIREN fourni par le pack DATAFORGE'
          : null
    return { ...record, siren, resolutionStatus, resolutionReason }
  })
  for (let index = 0; index < payload.length; index += 200) {
    await accountsRepo.upsert(payload.slice(index, index + 200) as QueryDeepPartialEntity<DataforgeAccountEntity>[], {
      conflictPaths: ['sourceId'],
      skipUpdateIfNoValuesChanged: true,
    })
  }

  console.log(`Comptes: ${accounts.size} (dont ${sirenFromPack} SIREN fournis par le pack)`)
  console.log(`Lignes compte × domaine: ${rows}`)
  if (rejected.length > 0) {
    console.log(`Lignes écartées: ${rejected.length} — premières raisons :`)
    for (const reason of rejected.slice(0, 20)) console.log(`  · ${reason}`)
  } else {
    console.log('Lignes écartées: 0')
  }
  reportColumns(header, audit)
  await dataSource.destroy()
}

void main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
