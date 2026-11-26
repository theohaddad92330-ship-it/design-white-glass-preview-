import { createHash } from 'node:crypto'
import type { DataSource } from 'typeorm'
import { marketMatchKey } from '../../modules/market-memory/market-company-key'

/**
 * Lot 791 — dérivation `positions` (pack v2.1, lignes déjà en base : `market_v2_rows`) → `market_person_paths`.
 * Lancée par l'OPÉRATEUR (`ingest:market-paths-v2`), IDEMPOTENTE (upsert sur `row_key`), `--dry-run` sans écriture.
 *
 * Règles : aucune donnée inventée — start_date / ended_on / date_precision restent NULL ; le caractère actuel ou passé
 * se porte par `is_current` (Oui/Non de la source, NULL sinon). `work_status` : « ESN » → `esn` (esn_name = l'entreprise),
 * tout le reste → `inconnu` (on ne devine ni freelance ni salarié). `person_key` est déjà pseudonymisé : aucun nom de
 * personne n'est lu. `role_family` reste NULL : le pack ne la porte pas et aucun classifieur titre → famille n'existe.
 */

export type SkipReason = 'sans_person_key' | 'sans_entreprise'

export interface PathDraftV2 {
  rowKey: string
  personKey: string
  companyKey: string
  companyName: string
  matchKey: string | null
  jobTitle: string | null
  roleFamily: null
  startDate: null
  endDate: null
  datePrecision: null
  isCurrent: boolean | null
  workStatus: 'esn' | 'inconnu'
  esnName: string | null
  esnKey: string | null
  datasetVersion: string
  sourceChecksum: string | null
}

interface MapContext {
  version: string
  checksum: string | null
  /** match_key normalisé → clé du corpus, `null` quand le nom désigne PLUSIEURS entreprises (jamais deviné). */
  signalKeyByMatchKey: ReadonlyMap<string, string | null>
}

const text = (value: string | undefined): string => (value ?? '').trim()

export function mapPositionRow(
  data: Readonly<Record<string, string>>,
  ctx: MapContext,
): PathDraftV2 | { skipped: SkipReason } {
  const personKey = text(data['person_key'])
  if (personKey === '') return { skipped: 'sans_person_key' }
  const accountId = text(data['account_id'])
  const name = text(data['account_name']) || text(data['account_name_raw'])
  const rawKey = marketMatchKey(text(data['account_name_raw']) || name)
  if (accountId === '' && rawKey === '') return { skipped: 'sans_entreprise' }

  const matchKey = marketMatchKey(name)
  const companyKey = (matchKey === '' ? null : ctx.signalKeyByMatchKey.get(matchKey)) ?? (accountId || rawKey)
  const jobTitle = text(data['role_title']) || null
  const isEsn = text(data['employer_role']).toLowerCase() === 'esn'
  const current = text(data['is_current_2024']).toLowerCase()
  const companyName = name || text(data['account_name_raw'])

  return {
    rowKey: createHash('sha256')
      .update([personKey, accountId || rawKey, jobTitle ?? '', text(data['source'])].join('\u0000'))
      .digest('hex'),
    personKey,
    companyKey,
    companyName,
    matchKey: matchKey === '' ? null : matchKey,
    jobTitle,
    roleFamily: null,
    startDate: null,
    endDate: null,
    datePrecision: null,
    isCurrent: current === 'oui' ? true : current === 'non' ? false : null,
    workStatus: isEsn ? 'esn' : 'inconnu',
    esnName: isEsn ? companyName : null,
    esnKey: isEsn && matchKey !== '' ? matchKey : null,
    datasetVersion: ctx.version,
    sourceChecksum: ctx.checksum,
  }
}

export interface MarketPathsV2Store {
  latestPositions(): Promise<{ version: string; checksum: string | null } | null>
  signalKeyByMatchKey(): Promise<Map<string, string | null>>
  readPositions(version: string): AsyncIterable<Record<string, string>[]>
  upsert(drafts: PathDraftV2[]): Promise<number>
}

export interface MarketPathsV2Report {
  read: number
  derived: number
  written: number
  duplicates: number
  skipped: Record<SkipReason, number>
  error?: string
}

const UPSERT_BATCH = 1000

export async function deriveMarketPathsV2(args: {
  store: MarketPathsV2Store
  dryRun: boolean
  log: (line: string) => void
}): Promise<MarketPathsV2Report> {
  const { store, dryRun, log } = args
  const report: MarketPathsV2Report = {
    read: 0,
    derived: 0,
    written: 0,
    duplicates: 0,
    skipped: { sans_person_key: 0, sans_entreprise: 0 },
  }
  const latest = await store.latestPositions()
  if (latest === null) {
    report.error = 'Table « positions » du pack v2.1 absente de la base : lancer d’abord ingest:market-v2.'
    log(report.error)
    return report
  }
  const ctx: MapContext = {
    version: latest.version,
    checksum: latest.checksum,
    signalKeyByMatchKey: await store.signalKeyByMatchKey(),
  }
  const drafts = new Map<string, PathDraftV2>()
  for await (const batch of store.readPositions(latest.version)) {
    for (const data of batch) {
      report.read += 1
      const mapped = mapPositionRow(data, ctx)
      if ('skipped' in mapped) {
        report.skipped[mapped.skipped] += 1
        continue
      }
      const seen = drafts.get(mapped.rowKey)
      if (seen) {
        report.duplicates += 1
        if (mapped.isCurrent === true) seen.isCurrent = true
        else if (seen.isCurrent === null) seen.isCurrent = mapped.isCurrent
      } else drafts.set(mapped.rowKey, mapped)
    }
  }
  report.derived = drafts.size
  if (!dryRun) {
    const all = [...drafts.values()]
    for (let i = 0; i < all.length; i += UPSERT_BATCH)
      report.written += await store.upsert(all.slice(i, i + UPSERT_BATCH))
  }
  log(
    `positions ${latest.version} : ${report.read} lues, ${report.derived} parcours dérivés, ${report.written} écrits${dryRun ? ' (à blanc)' : ''}, ` +
      `${report.duplicates} doublons fusionnés, écartées : ${report.skipped.sans_person_key} sans person_key, ${report.skipped.sans_entreprise} sans entreprise`,
  )
  return report
}

const READ_BATCH = 5000

export function createPgMarketPathsV2Store(dataSource: DataSource): MarketPathsV2Store {
  return {
    async latestPositions() {
      const rows = (await dataSource.query(
        `SELECT dataset_version, file_sha256 FROM market_v2_datasets
          WHERE source_table = 'positions' AND loaded_at IS NOT NULL ORDER BY loaded_at DESC LIMIT 1`,
      )) as { dataset_version: string; file_sha256: string | null }[]
      const first = rows[0]
      return first ? { version: first.dataset_version, checksum: first.file_sha256 } : null
    },
    async signalKeyByMatchKey() {
      const rows = (await dataSource.query(`SELECT company_key, match_key FROM market_company_signal`)) as {
        company_key: string
        match_key: string
      }[]
      const out = new Map<string, string | null>()
      for (const r of rows) out.set(r.match_key, out.has(r.match_key) ? null : r.company_key)
      return out
    },
    async *readPositions(version) {
      let last = 0
      for (;;) {
        const rows = (await dataSource.query(
          `SELECT row_no, data FROM market_v2_rows
            WHERE dataset_version = $1 AND source_table = 'positions' AND row_no > $2 ORDER BY row_no LIMIT $3`,
          [version, last, READ_BATCH],
        )) as { row_no: number; data: Record<string, string> }[]
        if (rows.length === 0) return
        last = rows[rows.length - 1]?.row_no ?? last
        yield rows.map(r => r.data)
      }
    },
    async upsert(drafts) {
      const col = <K extends keyof PathDraftV2>(k: K): PathDraftV2[K][] => drafts.map(d => d[k])
      await dataSource.query(
        `INSERT INTO market_person_paths
           (row_key, person_key, company_key, company_name, match_key, job_title, is_current, work_status,
            esn_name, esn_key, corpus_label, dataset_version, source_checksum, source_family, imported_at)
         SELECT r.row_key, r.person_key, r.company_key, r.company_name, r.match_key, r.job_title, r.is_current,
                r.work_status, r.esn_name, r.esn_key, 'market_v2', r.dataset_version, r.source_checksum,
                'market_v2_positions', now()
           FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::boolean[],
                       $8::text[], $9::text[], $10::text[], $11::text[], $12::text[])
                AS r(row_key, person_key, company_key, company_name, match_key, job_title, is_current, work_status,
                     esn_name, esn_key, dataset_version, source_checksum)
         ON CONFLICT (row_key) DO UPDATE SET
           company_key = EXCLUDED.company_key, company_name = EXCLUDED.company_name, match_key = EXCLUDED.match_key,
           job_title = EXCLUDED.job_title, is_current = EXCLUDED.is_current, work_status = EXCLUDED.work_status,
           esn_name = EXCLUDED.esn_name, esn_key = EXCLUDED.esn_key, dataset_version = EXCLUDED.dataset_version,
           source_checksum = EXCLUDED.source_checksum, imported_at = now()`,
        [
          col('rowKey'),
          col('personKey'),
          col('companyKey'),
          col('companyName'),
          col('matchKey'),
          col('jobTitle'),
          col('isCurrent'),
          col('workStatus'),
          col('esnName'),
          col('esnKey'),
          col('datasetVersion'),
          col('sourceChecksum'),
        ],
      )
      return drafts.length
    },
  }
}
