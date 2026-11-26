import type { DataSource } from 'typeorm'
import { sirenOf } from '../../common/dataforge-grappe'
import { marketMatchKey, marketRootDomain } from '../../modules/market-memory/market-company-key'

/**
 * Lot 793 (Louis 04/11/2026) — construction du référentiel pivot `common_account_links`, lancée par l'OPÉRATEUR
 * (`ingest:common-account-links`), IDEMPOTENTE, `--dry-run` sans écriture.
 *
 * Sources : `market_v2_rows` (dernière version chargée de `accounts` et `account_aliases`) et `dataforge_accounts`.
 * Une ligne = une clé normalisée → une entreprise commune (`common_id` = BM-A, à défaut la fiche DF).
 *
 * Règles :
 *  · la normalisation est CELLE DU DÉPÔT (`sirenOf`, `marketRootDomain`, `marketMatchKey`), la même que le résolveur
 *    applique au compte de l'espace — jamais `alias_norm` du pack (`bm_norm.norm2`) : deux normalisations différentes
 *    ne se rencontrent jamais ;
 *  · une fiche DF qu'un BM-A référence (`dataforge_id`) porte le `common_id` du BM-A : ses clés s'y ajoutent (lien, pas
 *    fusion — les deux identifiants restent). Référencée par plusieurs BM-A, elle se lie à chacun (l'ambiguïté se voit) ;
 *  · TOUS les alias sont écrits, `is_preferred = 0` compris : un alias partagé fait plusieurs lignes, et c'est le
 *    résolveur qui dit « ambigu » — l'écarter rendrait unique un nom que le pack sait ambigu ;
 *  · aucune clé inventée : pas de site ⇒ pas de domaine, SIREN de moins de 9 chiffres ⇒ pas de SIREN.
 */

type LinkOrigin = 'market_v2_accounts' | 'market_v2_aliases' | 'dataforge_accounts'
type KeyKind = 'siren' | 'domain' | 'name'

export interface LinkDraft {
  keyKind: KeyKind
  keyValue: string
  commonId: string
  bmAccountId: string | null
  dataforgeSourceId: string | null
  groupAccountId: string | null
  companyName: string
  origins: LinkOrigin[]
}

export interface DataforgeFiche {
  source_id: string
  name: string
  legal_name: string | null
  siren: string | null
  website: string | null
}

export interface CommonAccountLinksReport {
  bmAccounts: number
  dataforge: number
  dataforgeLinkedToBm: number
  dataforgeOnly: number
  aliases: number
  aliasesWithoutAccount: number
  links: number
  keys: Record<KeyKind, number>
  ambiguousKeys: Record<KeyKind, number>
  written: number
  removed: number
  error?: string
}

const BM = /^BM-A-[0-9]+$/
const DF = /^DF-/
const text = (value: string | null | undefined): string => (value ?? '').trim()

type Company = {
  commonId: string
  bmAccountId: string | null
  dataforgeSourceId: string | null
  groupAccountId: string | null
  companyName: string
}

export function buildCommonAccountLinks(input: {
  accounts: readonly Record<string, string>[]
  aliases: readonly Record<string, string>[]
  dataforge: readonly DataforgeFiche[]
}): { links: LinkDraft[]; report: CommonAccountLinksReport } {
  const report: CommonAccountLinksReport = {
    bmAccounts: 0,
    dataforge: input.dataforge.length,
    dataforgeLinkedToBm: 0,
    dataforgeOnly: 0,
    aliases: 0,
    aliasesWithoutAccount: 0,
    links: 0,
    keys: { siren: 0, domain: 0, name: 0 },
    ambiguousKeys: { siren: 0, domain: 0, name: 0 },
    written: 0,
    removed: 0,
  }
  const links = new Map<string, LinkDraft>()
  const add = (company: Company, kind: KeyKind, value: string | null, origin: LinkOrigin) => {
    if (!value) return
    const id = `${kind}\u0000${value}\u0000${company.commonId}`
    const seen = links.get(id)
    if (seen) {
      if (!seen.origins.includes(origin)) seen.origins.push(origin)
      return
    }
    links.set(id, { keyKind: kind, keyValue: value, ...company, origins: [origin] })
  }
  const addNames = (company: Company, names: readonly string[], origin: LinkOrigin) => {
    for (const name of names) {
      const key = marketMatchKey(name)
      if (key !== '') add(company, 'name', key, origin)
    }
  }
  const addFiche = (company: Company, fiche: DataforgeFiche) => {
    add(company, 'siren', sirenOf(fiche.siren), 'dataforge_accounts')
    add(company, 'domain', marketRootDomain(fiche.website), 'dataforge_accounts')
    addNames(company, [fiche.name, text(fiche.legal_name)], 'dataforge_accounts')
  }

  const ficheById = new Map(input.dataforge.filter(f => DF.test(f.source_id)).map(f => [f.source_id, f]))
  const companyByBm = new Map<string, Company>()
  const referencedDf = new Set<string>()
  for (const row of input.accounts) {
    const bmId = text(row['account_id'])
    const name = text(row['account_name'])
    if (!BM.test(bmId) || name === '' || companyByBm.has(bmId)) continue
    report.bmAccounts += 1
    const dfId = text(row['dataforge_id'])
    const group = text(row['group_account_id'])
    const company: Company = {
      commonId: bmId,
      bmAccountId: bmId,
      dataforgeSourceId: DF.test(dfId) ? dfId : null,
      groupAccountId: BM.test(group) ? group : bmId,
      companyName: name,
    }
    companyByBm.set(bmId, company)
    add(company, 'siren', sirenOf(text(row['siren_siret']) || null), 'market_v2_accounts')
    add(company, 'domain', marketRootDomain(text(row['website']) || null), 'market_v2_accounts')
    addNames(
      company,
      [name, text(row['legal_name']), ...text(row['merged_variants']).split('|')].map(s => s.trim()).filter(Boolean),
      'market_v2_accounts',
    )
    const fiche = company.dataforgeSourceId ? ficheById.get(company.dataforgeSourceId) : undefined
    if (fiche) {
      if (!referencedDf.has(fiche.source_id)) report.dataforgeLinkedToBm += 1
      referencedDf.add(fiche.source_id)
      addFiche(company, fiche)
    }
  }
  for (const fiche of ficheById.values()) {
    if (referencedDf.has(fiche.source_id) || text(fiche.name) === '') continue
    report.dataforgeOnly += 1
    addFiche(
      {
        commonId: fiche.source_id,
        bmAccountId: null,
        dataforgeSourceId: fiche.source_id,
        groupAccountId: null,
        companyName: fiche.name.trim(),
      },
      fiche,
    )
  }
  for (const row of input.aliases) {
    report.aliases += 1
    const company = companyByBm.get(text(row['account_id']))
    if (!company) {
      report.aliasesWithoutAccount += 1
      continue
    }
    addNames(company, [text(row['alias'])], 'market_v2_aliases')
  }

  const out = [...links.values()]
  const idsOfKey = new Map<string, Set<string>>()
  for (const link of out) {
    const k = `${link.keyKind}\u0000${link.keyValue}`
    idsOfKey.set(k, (idsOfKey.get(k) ?? new Set()).add(link.commonId))
  }
  for (const [k, ids] of idsOfKey) {
    const kind = k.split('\u0000')[0] as KeyKind
    report.keys[kind] += 1
    if (ids.size > 1) report.ambiguousKeys[kind] += 1
  }
  report.links = out.length
  return { links: out, report }
}

export interface CommonAccountLinksStore {
  latestVersion(table: 'accounts' | 'account_aliases'): Promise<string | null>
  readRows(table: 'accounts' | 'account_aliases', version: string): Promise<Record<string, string>[]>
  readDataforge(): Promise<DataforgeFiche[]>
  /** Écrit TOUTES les lignes et retire celles absentes du calcul, en une transaction. */
  replace(links: LinkDraft[]): Promise<{ written: number; removed: number }>
}

export async function runCommonAccountLinks(args: {
  store: CommonAccountLinksStore
  dryRun: boolean
  log: (line: string) => void
}): Promise<CommonAccountLinksReport> {
  const { store, dryRun, log } = args
  const accountsVersion = await store.latestVersion('accounts')
  if (accountsVersion === null) {
    const empty = buildCommonAccountLinks({ accounts: [], aliases: [], dataforge: [] }).report
    empty.error = 'Table « accounts » du pack v2.1 absente de la base : lancer d’abord ingest:market-v2.'
    log(empty.error)
    return empty
  }
  const aliasesVersion = await store.latestVersion('account_aliases')
  const { links, report } = buildCommonAccountLinks({
    accounts: await store.readRows('accounts', accountsVersion),
    aliases: aliasesVersion ? await store.readRows('account_aliases', aliasesVersion) : [],
    dataforge: await store.readDataforge(),
  })
  if (!aliasesVersion) log('account_aliases absente du pack chargé : clés d’alias non construites.')
  if (!dryRun) Object.assign(report, await store.replace(links))
  log(
    `common_account_links : ${report.bmAccounts} comptes BM-A, ${report.dataforge} fiches DF (${report.dataforgeLinkedToBm} reliées à un BM-A, ` +
      `${report.dataforgeOnly} seules), ${report.aliases} alias (${report.aliasesWithoutAccount} sans compte) → ${report.links} liens ` +
      `[clés siren ${report.keys.siren}, domaine ${report.keys.domain}, nom ${report.keys.name} ; ambiguës siren ${report.ambiguousKeys.siren}, ` +
      `domaine ${report.ambiguousKeys.domain}, nom ${report.ambiguousKeys.name}] — ${report.written} écrits, ${report.removed} retirés${dryRun ? ' (à blanc)' : ''}`,
  )
  return report
}

const READ_BATCH = 5000
const WRITE_BATCH = 2000

export function createPgCommonAccountLinksStore(dataSource: DataSource): CommonAccountLinksStore {
  return {
    async latestVersion(table) {
      const rows = (await dataSource.query(
        `SELECT dataset_version FROM market_v2_datasets WHERE source_table = $1 ORDER BY loaded_at DESC LIMIT 1`,
        [table],
      )) as { dataset_version: string }[]
      return rows[0]?.dataset_version ?? null
    },
    async readRows(table, version) {
      const out: Record<string, string>[] = []
      let last = 0
      for (;;) {
        const rows = (await dataSource.query(
          `SELECT row_no, data FROM market_v2_rows
            WHERE dataset_version = $1 AND source_table = $2 AND row_no > $3 ORDER BY row_no LIMIT $4`,
          [version, table, last, READ_BATCH],
        )) as { row_no: number; data: Record<string, string> }[]
        if (rows.length === 0) return out
        last = rows[rows.length - 1]?.row_no ?? last
        for (const row of rows) out.push(row.data)
      }
    },
    async readDataforge() {
      return (await dataSource.query(
        `SELECT source_id, name, legal_name, siren, website FROM dataforge_accounts ORDER BY source_id`,
      )) as DataforgeFiche[]
    },
    async replace(links) {
      return dataSource.transaction(async manager => {
        const builtAt = new Date()
        let written = 0
        for (let i = 0; i < links.length; i += WRITE_BATCH) {
          const batch = links.slice(i, i + WRITE_BATCH)
          const col = <K extends keyof LinkDraft>(k: K): LinkDraft[K][] => batch.map(d => d[k])
          await manager.query(
            `INSERT INTO common_account_links
               (key_kind, key_value, common_id, bm_account_id, dataforge_source_id, group_account_id, company_name, origins, built_at)
             SELECT r.key_kind, r.key_value, r.common_id, r.bm_account_id, r.dataforge_source_id, r.group_account_id,
                    r.company_name, string_to_array(r.origins, ','), $9
               FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
                    AS r(key_kind, key_value, common_id, bm_account_id, dataforge_source_id, group_account_id, company_name, origins)
             ON CONFLICT (key_kind, key_value, common_id) DO UPDATE SET
               bm_account_id = EXCLUDED.bm_account_id, dataforge_source_id = EXCLUDED.dataforge_source_id,
               group_account_id = EXCLUDED.group_account_id, company_name = EXCLUDED.company_name,
               origins = EXCLUDED.origins, built_at = EXCLUDED.built_at`,
            [
              col('keyKind'),
              col('keyValue'),
              col('commonId'),
              col('bmAccountId'),
              col('dataforgeSourceId'),
              col('groupAccountId'),
              col('companyName'),
              batch.map(d => [...d.origins].sort().join(',')),
              builtAt,
            ],
          )
          written += batch.length
        }
        const removed = (await manager.query(
          `WITH gone AS (DELETE FROM common_account_links WHERE built_at < $1 RETURNING 1) SELECT count(*)::int AS n FROM gone`,
          [builtAt],
        )) as { n: number }[]
        return { written, removed: Number(removed[0]?.n ?? 0) }
      })
    },
  }
}
