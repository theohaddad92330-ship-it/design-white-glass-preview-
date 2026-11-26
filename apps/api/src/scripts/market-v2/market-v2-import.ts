import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { splitCsvLine } from '../../modules/contacts/csv-import'
import { createRecordAssembler, parseDataforgeHeader } from '../../modules/dataforge/dataforge-csv'

/**
 * Lot 783 (#5205) — le MOTEUR de l'import du pack marché v2.1 (`BELLUM_MARKET_MEMORY_v2`, 139 tables, 2,3 M lignes,
 * ~605 Mo). Ce qui décide ne parle jamais à la base : la base est un `MarketV2Store` injecté (réel :
 * `market-v2-store.ts`, tests : un double en mémoire). Le CLI est `../ingest-market-v2.ts`.
 *
 * Le contrat, dans l'ordre :
 *  1. version du pack = sha256 de `MANIFEST.csv` (absent → arrêt) ;
 *  2. AVANT toute écriture, chaque fichier sélectionné existe et son en-tête est EXACTEMENT celui du schéma (même
 *     colonnes, même ordre) — un écart arrête tout et nomme les colonnes (des noms, jamais une valeur) ;
 *  3. table par table, en streaming (assembleur d'enregistrements DATAFORGE : `;`, BOM, retours à la ligne cités) ;
 *     une table déjà chargée à la même version est SAUTÉE (rejeu idempotent) ; une table = une transaction côté
 *     store, donc une coupure ne laisse rien de la table coupée et la relance reprend là (reprise) ;
 *  4. chaque cellule `pii=1` du schéma part dans `identity` (le coffre `market_v2_row_identities`), jamais dans
 *     `data` — la séparation est PHYSIQUE, c'est elle que la garde `market-v2-pii-never-read.spec.ts` protège ;
 *  5. une ligne au mauvais nombre de cellules est écartée avec son NUMÉRO, jamais son contenu.
 *
 * Les listes internes (` | `) restent du texte brut : le dictionnaire ne dit pas quelles colonnes sont des listes,
 * et découper un texte libre qui contient ` | ` le corromprait. Le séparateur est nommé dans le schéma (`format`).
 */

interface MarketV2Column {
  column: string
  pii: string
}

export interface MarketV2Table {
  table: string
  folder: string
  rows: number
  file: string
  header: string[]
  columns: MarketV2Column[]
}

export interface MarketV2Schema {
  pack: string
  format: { delimiter: string; encoding: string; list_separator: string }
  tables: MarketV2Table[]
}

export function loadMarketV2Schema(): MarketV2Schema {
  return JSON.parse(readFileSync(join(__dirname, 'market-v2-schema.json'), 'utf8')) as MarketV2Schema
}

/**
 * Les colonnes que le dictionnaire du pack marque `pii=0` alors qu'elles portent un IDENTIFIANT DIRECT (e-mail,
 * téléphone, nom de personne) — relevé le 03/11/2026 sur les descriptions et les noms du schéma, sans lire une
 * valeur. Elles partent au coffre comme les `pii=1`. Liste FERMÉE et relue : une entrée qui ne correspond plus à une
 * colonne `pii=0` du schéma fait rougir `market-v2-import.spec.ts` (une correction périmée ne protège rien).
 * Les comptages (`email_rows`) et les pages entreprise (`linkedin_company_url`) n'y sont pas : ce ne sont pas des
 * personnes.
 */
export const PII_FLAG_CORRECTIONS: Readonly<Record<string, readonly string[]>> = {
  needs: ['client_contact_email', 'client_contact_phone'],
  internal_pipe_master: ['contact_name', 'contact_email', 'contact_phone'],
  internal_crm_ocr_contacts_extra: [
    'primary_name',
    'email',
    'phone',
    'email_norm',
    'linkedin_norm',
    'phone_norm',
    'full_name_norm',
  ],
  internal_crm_ocr_lead_rows: [
    'primary_name',
    'name_ocr',
    'email_ocr_raw',
    'email_ocr_clean',
    'email_complete',
    'phone_ocr_raw',
    'phone_ocr_digits',
    'email_norm',
    'linkedin_norm',
    'phone_norm',
    'full_name_norm',
  ],
}

/** Les colonnes qui vont au coffre : `pii=1` du dictionnaire, plus ses corrections. */
export function piiColumnsOf(table: MarketV2Table): string[] {
  const corrected = new Set(PII_FLAG_CORRECTIONS[table.table] ?? [])
  return table.columns.filter(c => c.pii === '1' || corrected.has(c.column)).map(c => c.column)
}

export interface MarketV2Row {
  rowNo: number
  accountId: string | null
  data: Record<string, string>
  identity: Record<string, string>
}

export interface MarketV2TableLoad {
  version: string
  table: string
  folder: string
  expectedRows: number
  piiColumns: string[]
  /** Résolu APRÈS la lecture complète (le fichier est haché au fil du flux). */
  fileSha256: () => string
  counts: () => { read: number; rejected: number }
}

export interface MarketV2Store {
  loadedTables(version: string): Promise<Set<string>>
  /** Une table = UNE transaction : tout ou rien. */
  loadTable(load: MarketV2TableLoad, batches: AsyncIterable<MarketV2Row[]>): Promise<{ written: number }>
}

type TableStatus = 'loaded' | 'skipped' | 'dry-run' | 'failed'

interface TableReport {
  table: string
  status: TableStatus
  expected: number
  read: number
  written: number
  rejected: number
}

export interface MarketV2ImportReport {
  version: string | null
  tables: TableReport[]
  error?: string
}

/** `null` si l'en-tête est exact ; sinon la raison, en NOMS de colonnes. */
export function checkHeader(table: MarketV2Table, header: string[]): string | null {
  if (header.length === table.header.length && header.every((h, i) => h === table.header[i])) return null
  const expected = new Set(table.header)
  const got = new Set(header)
  const missing = table.header.filter(h => !got.has(h))
  const extra = header.filter(h => !expected.has(h))
  const parts: string[] = []
  if (missing.length > 0) parts.push(`manquantes : ${missing.join(', ')}`)
  if (extra.length > 0) parts.push(`inattendues : ${extra.join(', ')}`)
  if (parts.length === 0) parts.push('mêmes colonnes, ordre différent')
  return `${table.table} (${table.file}) — en-tête différent du schéma, ${parts.join(' ; ')}`
}

export function splitRecord(
  table: MarketV2Table,
  cells: string[],
  rowNo: number,
): { kind: 'row'; row: MarketV2Row } | { kind: 'rejected'; reason: string } {
  if (cells.length !== table.header.length) {
    return {
      kind: 'rejected',
      reason: `ligne ${rowNo} : ${cells.length} cellules, ${table.header.length} attendues`,
    }
  }
  const pii = new Set(piiColumnsOf(table))
  const data: Record<string, string> = {}
  const identity: Record<string, string> = {}
  table.header.forEach((column, i) => {
    const value = cells[i] ?? ''
    if (value.trim().length === 0) return
    if (pii.has(column)) identity[column] = value
    else data[column] = value
  })
  return { kind: 'row', row: { rowNo, accountId: data.account_id?.trim() || null, data, identity } }
}

/** Les enregistrements d'un CSV, en flux ; le sha256 des OCTETS est disponible une fois le flux épuisé. */
function streamRecords(path: string): { records: AsyncIterable<string>; sha256: () => string } {
  const hash = createHash('sha256')
  let digest: string | null = null
  async function* records(): AsyncGenerator<string> {
    const decoder = new StringDecoder('utf8')
    const assembler = createRecordAssembler()
    for await (const chunk of createReadStream(path)) {
      hash.update(chunk as Buffer)
      yield* assembler.push(decoder.write(chunk as Buffer))
    }
    yield* assembler.push(decoder.end())
    const last = assembler.flush()
    if (last !== null) yield last
    digest = hash.digest('hex')
  }
  return {
    records: records(),
    sha256: () => {
      if (digest === null) throw new Error('flux non terminé')
      return digest
    },
  }
}

async function readHeader(path: string): Promise<string[] | null> {
  const { records } = streamRecords(path)
  for await (const record of records) return parseDataforgeHeader(record)
  return null
}

interface RunOptions {
  dir: string
  schema: MarketV2Schema
  /** `null` = `--dry-run` : lire et compter, aucune connexion, aucune écriture. */
  store: MarketV2Store | null
  only?: string
  batchSize?: number
  log: (line: string) => void
}

export async function runMarketV2Import(options: RunOptions): Promise<MarketV2ImportReport> {
  const { dir, schema, store, only, log } = options
  const batchSize = options.batchSize ?? 1000
  const report: MarketV2ImportReport = { version: null, tables: [] }
  const fail = (error: string): MarketV2ImportReport => {
    log(`ARRÊT — ${error}`)
    return { ...report, error }
  }

  const manifest = join(dir, 'MANIFEST.csv')
  if (!existsSync(manifest)) return fail(`MANIFEST.csv introuvable dans le dossier du pack`)
  report.version = createHash('sha256').update(readFileSync(manifest)).digest('hex')
  log(`Pack ${schema.pack} — version ${report.version}`)

  const selected = only === undefined ? schema.tables : schema.tables.filter(t => t.table === only)
  if (selected.length === 0) return fail(`--only=${only} : table inconnue du schéma`)

  // 2. Tous les en-têtes AVANT la première écriture.
  const headerErrors: string[] = []
  for (const table of selected) {
    const path = join(dir, table.file)
    if (!existsSync(path)) {
      headerErrors.push(`${table.table} — fichier absent : ${table.file}`)
      continue
    }
    const header = await readHeader(path)
    const error = header === null ? `${table.table} — fichier vide : ${table.file}` : checkHeader(table, header)
    if (error !== null) headerErrors.push(error)
  }
  if (headerErrors.length > 0) {
    for (const error of headerErrors) log(`  · ${error}`)
    return fail(`${headerErrors.length} fichier(s) hors schéma — rien n'a été écrit. ${headerErrors.join(' | ')}`)
  }

  const alreadyLoaded = store ? await store.loadedTables(report.version) : new Set<string>()

  for (const table of selected) {
    const entry: TableReport = {
      table: table.table,
      status: store ? 'loaded' : 'dry-run',
      expected: table.rows,
      read: 0,
      written: 0,
      rejected: 0,
    }
    report.tables.push(entry)
    if (alreadyLoaded.has(table.table)) {
      entry.status = 'skipped'
      log(`${table.table.padEnd(40)} déjà chargée à cette version — sautée`)
      continue
    }

    const stream = streamRecords(join(dir, table.file))
    const rejections: string[] = []
    async function* batches(): AsyncGenerator<MarketV2Row[]> {
      let header = true
      let batch: MarketV2Row[] = []
      for await (const record of stream.records) {
        if (header) {
          header = false
          continue
        }
        entry.read += 1
        const parsed = splitRecord(table, splitCsvLine(record, schema.format.delimiter), entry.read)
        if (parsed.kind === 'rejected') {
          entry.rejected += 1
          if (rejections.length < 5) rejections.push(parsed.reason)
          continue
        }
        batch.push(parsed.row)
        if (batch.length >= batchSize) {
          yield batch
          batch = []
        }
      }
      if (batch.length > 0) yield batch
    }

    try {
      if (store) {
        const result = await store.loadTable(
          {
            version: report.version,
            table: table.table,
            folder: table.folder,
            expectedRows: table.rows,
            piiColumns: piiColumnsOf(table),
            fileSha256: stream.sha256,
            counts: () => ({ read: entry.read, rejected: entry.rejected }),
          },
          batches(),
        )
        entry.written = result.written
      } else {
        for await (const _batch of batches()) void _batch
      }
    } catch (error) {
      entry.status = 'failed'
      const reason = error instanceof Error ? error.message : String(error)
      return fail(`${table.table} — échec, transaction annulée (rien de cette table n'est écrit) : ${reason}`)
    }

    const gap = entry.read === table.rows ? '' : `  ⚠ écart au dictionnaire : ${table.rows} attendues`
    log(`${table.table.padEnd(40)} lues ${entry.read}  écrites ${entry.written}  rejetées ${entry.rejected}${gap}`)
    for (const reason of rejections) log(`  · ${reason}`)
  }

  const sum = (key: 'read' | 'written' | 'rejected') => report.tables.reduce((n, t) => n + t[key], 0)
  log(
    `TOTAL ${report.tables.length} tables — lues ${sum('read')}  écrites ${sum('written')}  rejetées ${sum('rejected')}  sautées ${report.tables.filter(t => t.status === 'skipped').length}`,
  )
  return report
}
