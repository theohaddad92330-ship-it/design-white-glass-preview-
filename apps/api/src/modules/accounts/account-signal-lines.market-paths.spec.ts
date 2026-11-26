import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { MarketPersonPathsReader, MarketPersonPathView } from '../market-memory/market-person-path-view'
import { AccountSignalLinesService } from './account-signal-lines.service'

/** Lot 775 (Louis 02/11/2026) — les missions observées sur le marché chez un compte, SANS identité, dans l'historique. */

const WS = '11111111-1111-4111-8111-111111111111'
const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-11-02T12:00:00Z')

const PATH: MarketPersonPathView = {
  id: 'row-1',
  jobTitle: 'Data Engineer',
  roleFamily: 'Data',
  skills: ['Java', 'Kafka'],
  startDate: '2023-01-01',
  endDate: '2024-06-01',
  datePrecision: 'month',
  workStatus: 'freelance',
  esnName: 'Alten',
  dailyRateEur: 650,
  missionCity: 'Lyon',
  missionRegion: null,
  isCurrent: null,
}

function build(options: {
  paths?: Record<string, MarketPersonPathView[]>
  fail?: boolean
  fiches?: Array<{ source_id: string; name: string }>
}) {
  const personPathsFor = jest.fn(async (lookups: ReadonlyArray<{ ref: string; name: string }>) => {
    if (options.fail) return { status: 'unavailable' as const, reason: 'read_failed' }
    const paths = new Map<string, MarketPersonPathView[]>()
    for (const lookup of lookups) paths.set(lookup.ref, options.paths?.[lookup.name] ?? [])
    return { status: 'ok' as const, paths }
  })
  const query = jest.fn(async (sql: string) => {
    if (/FROM accounts a/.test(sql)) {
      return [
        {
          id: ACCOUNT,
          company_name: 'Thales',
          sector: null,
          logo_url: null,
          website: 'https://thales.example',
          recent_signals: [],
          raw_analysis: {},
          siren: '552120222',
          group_head_siren: null,
          signals_collected_at: '2026-10-24T08:00:00Z',
        },
      ]
    }
    if (/FROM dataforge_accounts/.test(sql)) {
      return (options.fiches ?? []).map(fiche => ({
        siren: '552120222',
        group_name: 'Groupe T',
        cluster_id: 'c1',
        ...fiche,
      }))
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
  const svc = {
    forAccount: (args: { workspaceId: string; accountId: string; now?: Date }) =>
      inner.forAccount({ ...args, marketPaths }),
  }
  return { svc, personPathsFor }
}

describe('AccountSignalLinesService — missions observées (mémoire marché)', () => {
  it('une mission observée devient UNE ligne datée, source Mémoire marché, sans nom de personne', async () => {
    const { svc } = build({ paths: { Thales: [PATH] } })
    const result = await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW })
    const line = result?.lines.find(candidate => candidate.type === 'mission_observee')
    expect(line).toMatchObject({
      origin_kind: 'memoire',
      period: 'past',
      title: 'Un freelance Data Engineer',
      tjm_eur: 650,
      technologies: ['Java', 'Kafka'],
    })
    expect(line?.detail).toContain('2023-2024')
    expect(line?.detail).toContain('via Alten')
    expect(line?.people_hints.names).toEqual([])
    expect(JSON.stringify(result)).not.toMatch(/person_?key/i)
  })

  it('un parcours SEUL s’affiche (le seuil de trois ne vaut que pour les agrégats)', async () => {
    const { svc } = build({ paths: { Thales: [PATH] } })
    const result = await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW })
    expect(result?.lines.filter(line => line.type === 'mission_observee')).toHaveLength(1)
  })

  it('valeur absente = rien d’écrit : sans TJM ni ESN ni techno, ni « 0 € » ni « via »', async () => {
    const bare: MarketPersonPathView = { ...PATH, dailyRateEur: null, esnName: null, skills: [], workStatus: 'salarie' }
    const { svc } = build({ paths: { Thales: [bare] } })
    const result = await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW })
    const line = result?.lines.find(candidate => candidate.type === 'mission_observee')
    expect(line?.title).toBe('Un salarié Data Engineer')
    expect(line?.tjm_eur).toBeUndefined()
    expect(line?.detail ?? '').not.toContain('via')
  })

  it('lit aussi la grappe : une mission chez une autre entité du groupe porte son entité', async () => {
    const { svc, personPathsFor } = build({
      fiches: [
        { source_id: 'S1', name: 'Thales' },
        { source_id: 'S2', name: 'Thales Sud' },
      ],
      paths: { 'Thales Sud': [PATH] },
    })
    const result = await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW })
    expect(personPathsFor).toHaveBeenCalledTimes(1)
    const line = result?.lines.find(candidate => candidate.type === 'mission_observee')
    expect(line?.entity).toBe('Thales Sud')
  })

  it('une panne de la mémoire marché n’efface rien d’autre et ne fabrique aucune ligne', async () => {
    const { svc } = build({ fail: true })
    const result = await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW })
    expect(result).not.toBeNull()
    expect(result?.lines.filter(line => line.type === 'mission_observee')).toEqual([])
  })
})
