import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import { type CommonAccountQuery, resolveCommonAccounts } from '../../common/common-account-links'
import { AccountSignalLinesService } from './account-signal-lines.service'

/**
 * Lot 794 (Louis 04/11/2026, « absolument tout rattaché, lié, accessible par n'importe quel angle ») — un compte de
 * l'espace résolu par le référentiel pivot en BM-A voit les familles du pack v2.1 rattachées à ce BM-A (et à son groupe) :
 * besoins, signaux, offres, comme lignes datées — la fiche compte (`forAccount`) ET l'Historique (`forWorkspace`, recherche
 * serveur comprise). Rien ne traverse les espaces, aucune personne ne sort.
 */

const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '99999999-9999-4999-8999-999999999999'
const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-11-04T12:00:00Z')
const LOADED_AT = new Date('2026-11-03T10:00:00Z')

const link = (over: Record<string, string | null>) => ({
  key_kind: 'name',
  key_value: 'alten',
  common_id: 'BM-A-000001',
  bm_account_id: 'BM-A-000001',
  dataforge_source_id: null,
  group_account_id: 'BM-A-000001',
  company_name: 'Alten',
  ...over,
})
const LINKS = [
  link({}),
  link({ key_value: 'alten sud', common_id: 'BM-A-000002', bm_account_id: 'BM-A-000002', company_name: 'Alten Sud' }),
]

const v2 = (source_table: string, row_no: number, account_id: string, data: Record<string, string>) => ({
  source_table,
  row_no,
  account_id,
  loaded_at: LOADED_AT,
  data,
})
const V2_ROWS = [
  // Un besoin sans date du fait : repli sur la date de la source.
  v2('needs', 1, 'BM-A-000001', {
    need_uid: 'BM-N-aaa',
    title: 'Développeur back-end',
    technologies: 'Java|Spring Boot',
    family: 'Développement',
    source_date: '2024-03',
    outcome_raw: 'perdu',
    amount_eur: '650',
    amount_type: 'TJM annoncé',
    city_norm: 'lyon',
  }),
  // Un doublon d'un besoin déjà présent via une autre source : une seule ligne.
  v2('needs', 2, 'BM-A-000001', {
    need_uid: 'BM-N-bbb',
    title: 'Doublon écarté',
    source_date: '2024-03',
    is_duplicate: '1',
  }),
  // Un signal d'une filiale du groupe : l'entité se nomme.
  v2('signals', 7, 'BM-A-000002', {
    signal_type: "appel d'offres",
    title: 'Refonte du SI RH',
    description: 'Programme de refonte du SIRH sur deux ans',
    date: '2023-05',
  }),
  // Une offre SANS aucune date : gardée, en Historique, à l'année où la source a été vue.
  v2('job_postings', 3, 'BM-A-000001', { title: 'Architecte cloud', city: 'Paris', contract: 'CDI' }),
  // Une ligne d'un BM-A étranger à l'espace : jamais rendue.
  v2('needs', 9, 'BM-A-999999', { need_uid: 'BM-N-zzz', title: 'Hors compte', source_date: '2024-01' }),
]

function build(accountWorkspace = WS) {
  const sql: Array<{ text: string; params: unknown[] }> = []
  const query = jest.fn(async (text: string, params: unknown[]) => {
    sql.push({ text, params })
    const accountRow = {
      id: ACCOUNT,
      company_name: 'ALTEN SAS',
      sector: null,
      logo_url: null,
      website: null,
      recent_signals: [],
      raw_analysis: {},
      siren: null,
      group_head_siren: null,
      signals_collected_at: null,
    }
    if (/FROM accounts\b/.test(text)) return params[0] === accountWorkspace ? [accountRow] : []
    if (/FROM common_account_links/.test(text) && /group_account_id = ANY/.test(text)) return LINKS
    if (/FROM common_account_links/.test(text)) {
      const names = (params[2] as string[]) ?? []
      return LINKS.filter(l => names.includes(l.key_value))
    }
    if (/FROM market_v2_rows/.test(text)) {
      const ids = params[0] as string[]
      return V2_ROWS.filter(row => ids.includes(row.account_id))
    }
    return []
  })
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'addSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy'])
    chain[method] = () => chain
  chain['getRawMany'] = async () => []
  const repo = { manager: { query, createQueryBuilder: () => chain } } as unknown as Repository<AccountEntity>
  const inner = new AccountSignalLinesService(repo)
  const commonAccounts = (workspaceId: string) => (ids: readonly string[]) =>
    resolveCommonAccounts(query as unknown as CommonAccountQuery, workspaceId, ids)
  return {
    forAccount: (workspaceId: string) =>
      inner.forAccount({ workspaceId, accountId: ACCOUNT, now: NOW, commonAccounts: commonAccounts(workspaceId) }),
    forWorkspace: (workspaceId: string, search?: string) =>
      inner.forWorkspace({ workspaceId, now: NOW, commonAccounts: commonAccounts(workspaceId), search }),
    sql,
  }
}

describe('AccountSignalLinesService — familles du pack v2.1 rattachées par le pivot (lot 794)', () => {
  it('fiche compte : besoins, signaux et offres du BM-A et de son groupe deviennent des lignes datées', async () => {
    const { forAccount } = build()
    const lines = (await forAccount(WS))?.lines ?? []
    const need = lines.find(l => l.title === 'Développeur back-end')
    expect(need).toMatchObject({
      type: 'besoin_passe',
      origin_kind: 'memoire',
      date: '2024-03-01',
      date_precision: 'month',
      period: 'past',
      outcome: 'lost',
      tjm_eur: 650,
      technologies: ['Java', 'Spring Boot'],
    })
    expect(lines.find(l => l.title === 'Refonte du SI RH')).toMatchObject({
      type: 'marche_public',
      entity: 'Alten Sud',
      date: '2023-05-01',
      detail: 'Programme de refonte du SIRH sur deux ans',
    })
    // Sans date : gardée en Historique, à l'année de la source vue — jamais jetée, jamais « Actuel ».
    expect(lines.find(l => l.title === 'Architecte cloud')).toMatchObject({
      type: 'recrutement',
      period: 'past',
      date: '2026-01-01',
      date_precision: 'year',
      contract_type: 'CDI',
    })
    expect(lines.map(l => l.title)).not.toContain('Doublon écarté')
    expect(JSON.stringify(lines)).not.toContain('Hors compte')
  })

  it('ne lit que les BM-A résolus, la dernière version de chaque table, et aucune colonne qui nomme une personne', async () => {
    const { forAccount, sql } = build()
    await forAccount(WS)
    const read = sql.find(s => /FROM market_v2_rows/.test(s.text))
    expect(read?.params[0]).toEqual(expect.arrayContaining(['BM-A-000001', 'BM-A-000002']))
    expect(read?.text).toMatch(/market_v2_datasets/)
    expect(read?.text).not.toMatch(/prescripteur|client_contact|consultant|identities/)
  })

  it('Historique : la recherche serveur trouve ces lignes (« java »), et pas ce qu’elles ne disent pas', async () => {
    const { forWorkspace } = build()
    expect((await forWorkspace(WS, 'java')).accounts.map(a => a.account_id)).toEqual([ACCOUNT])
    expect((await forWorkspace(WS, 'cobol')).accounts).toEqual([])
  })

  it('refus cross-espace : lu depuis un autre espace, rien — le pack n’est même pas lu', async () => {
    const { forAccount, sql } = build(OTHER_WS)
    expect(await forAccount(WS)).toBeNull()
    expect(sql.some(s => /market_v2_rows/.test(s.text))).toBe(false)
  })
})
