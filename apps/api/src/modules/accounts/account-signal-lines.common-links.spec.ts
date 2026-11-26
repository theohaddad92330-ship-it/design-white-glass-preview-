import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { MarketPersonPathsReader, MarketPersonPathView } from '../market-memory/market-person-path-view'
import { type CommonAccountQuery, resolveCommonAccounts } from '../../common/common-account-links'
import { AccountSignalLinesService } from './account-signal-lines.service'

/**
 * Lot 793 (Louis 04/11/2026) — un compte de l'espace relié par le référentiel pivot à un BM-A du pack v2.1 voit SES
 * besoins (fiches DF du BM-A et du groupe, besoins sans fiche dont l'entreprise se résout) et SES parcours (clé BM-A),
 * sans SIREN — et rien ne traverse les espaces.
 */

const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '99999999-9999-4999-8999-999999999999'
const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-11-04T12:00:00Z')

const PATH: MarketPersonPathView = {
  id: 'row-bm',
  jobTitle: 'Data Engineer',
  roleFamily: null,
  skills: [],
  startDate: '2022-01-01',
  endDate: '2023-06-01',
  datePrecision: 'month',
  workStatus: 'inconnu',
  esnName: null,
  dailyRateEur: null,
  missionCity: null,
  missionRegion: null,
  isCurrent: false,
}

const link = (over: Record<string, string | null>) => ({
  key_kind: 'name',
  key_value: 'alten',
  common_id: 'BM-A-000001',
  bm_account_id: 'BM-A-000001',
  dataforge_source_id: 'DF-0001',
  group_account_id: 'BM-A-000001',
  company_name: 'Alten',
  ...over,
})
const LINKS = [
  link({}),
  link({
    key_value: 'alten sud',
    common_id: 'BM-A-000002',
    bm_account_id: 'BM-A-000002',
    dataforge_source_id: null,
    company_name: 'Alten Sud',
  }),
]

function build(accountWorkspace = WS) {
  const sql: Array<{ text: string; params: unknown[] }> = []
  const personPathsFor = jest.fn(
    async (lookups: ReadonlyArray<{ ref: string; name: string; commonKeys?: readonly string[] }>) => {
      const paths = new Map<string, MarketPersonPathView[]>()
      for (const lookup of lookups)
        paths.set(lookup.ref, (lookup.commonKeys ?? []).includes('BM-A-000002') ? [PATH] : [])
      return { status: 'ok' as const, paths }
    },
  )
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
    if (/FROM dataforge_accounts/.test(text) && /source_id = ANY/.test(text)) {
      return [{ source_id: 'DF-0001', name: 'Alten', est_doublon: false }]
    }
    if (/FROM dataforge_needs/.test(text) && /account_source_id IS NULL/.test(text)) {
      return [
        {
          id: 'n-unlinked',
          entreprise: 'Alten Sud',
          title: 'Besoin sans fiche',
          status: 'GAGNE',
          need_date: '2025-03-01',
        },
        { id: 'n-other', entreprise: 'Inconnue', title: 'Hors compte', status: 'GAGNE', need_date: '2025-03-01' },
      ].map(n => ({
        starts_on: null,
        tjm_eur: null,
        technologies: [],
        prescriber_name: null,
        prescriber_title: null,
        location: null,
        ...n,
      }))
    }
    if (/FROM dataforge_needs/.test(text)) {
      return (params[0] as string[]).includes('DF-0001')
        ? [
            {
              account_source_id: 'DF-0001',
              id: 'n-df',
              title: 'Besoin DF',
              status: 'PERDU',
              need_date: '2024-05-01',
              starts_on: null,
              tjm_eur: null,
              technologies: [],
              prescriber_name: null,
              prescriber_title: null,
              location: null,
            },
          ]
        : []
    }
    return []
  })
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'addSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy'])
    chain[method] = () => chain
  chain['getRawMany'] = async () => []
  const repo = { manager: { query, createQueryBuilder: () => chain } } as unknown as Repository<AccountEntity>
  const inner = new AccountSignalLinesService(repo)
  const marketPaths = personPathsFor as unknown as MarketPersonPathsReader
  return {
    // La porte telle que le contrôleur la construit : liée à l'espace du lecteur.
    forAccount: (workspaceId: string) =>
      inner.forAccount({
        workspaceId,
        accountId: ACCOUNT,
        now: NOW,
        marketPaths,
        commonAccounts: ids => resolveCommonAccounts(query as unknown as CommonAccountQuery, workspaceId, ids),
      }),
    personPathsFor,
    sql,
  }
}

describe('AccountSignalLinesService — référentiel pivot (lot 793)', () => {
  it('sans SIREN, relié par nom unique à un BM-A : voit le besoin DF du BM-A ET le besoin sans fiche de sa filiale', async () => {
    const { forAccount } = build()
    const result = await forAccount(WS)
    const needs = result?.lines.filter(l => l.type === 'besoin_passe') ?? []
    expect(needs.map(l => l.title).sort()).toEqual(['Besoin DF', 'Besoin sans fiche'])
    expect(needs.find(l => l.title === 'Besoin sans fiche')?.entity).toBe('Alten Sud')
    expect(JSON.stringify(result)).not.toContain('Hors compte')
  })

  it('voit les parcours rangés sous un BM-A de son groupe, avec l’entité', async () => {
    const { forAccount, personPathsFor } = build()
    const result = await forAccount(WS)
    const missions = result?.lines.filter(l => l.type === 'mission_observee') ?? []
    expect(missions).toHaveLength(1)
    expect(missions[0]?.entity).toBe('Alten Sud')
    const lookups = personPathsFor.mock.calls[0]?.[0] ?? []
    expect(lookups.find(l => l.ref === ACCOUNT)?.commonKeys).toEqual(['BM-A-000001'])
  })

  it('refus cross-espace : lu depuis un autre espace, rien — et la table pivot n’est même pas lue', async () => {
    const { forAccount, sql } = build(OTHER_WS)
    expect(await forAccount(WS)).toBeNull()
    expect(sql.some(s => /common_account_links/.test(s.text))).toBe(false)
  })
})
