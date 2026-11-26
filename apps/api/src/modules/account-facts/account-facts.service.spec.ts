import { accountFactsSchema } from '@bellum/contracts'
import { AccountFactsService } from './account-facts.service'

const WS = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const ACCOUNT = '33333333-3333-4333-8333-333333333333'
const AS_OF = new Date('2026-10-12T08:00:00.000Z')

type Call = { sql: string; params: unknown[] }

function fakeRepo(byTable: Record<string, unknown[]>, opts: { fail?: string; account?: boolean } = {}) {
  const calls: Call[] = []
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params })
    const table = Object.keys(byTable).find(t => new RegExp(`FROM ${t}\\b`).test(sql))
    if (/FROM accounts\b/.test(sql) && !table)
      return opts.account === false
        ? []
        : [
            {
              company_name: 'Sanofi',
              recent_signals: [{ signal: 'Nouveau DSI nommé', type: 'nomination', date: '2026-09-30' }],
            },
          ]
    if (opts.fail && table === opts.fail) throw new Error('boom')
    return table ? byTable[table] : []
  })
  const getRepository = () => ({ find: jest.fn(async () => [{ id: 'c1', full_name: 'Jeanne' }]) })
  return { repo: { manager: { query, getRepository } } as never, calls }
}

const ROWS = {
  signal_history: [
    {
      label: 'Recrute 3 data engineers',
      signal_type: 'recrutement',
      signal_date: '2025-08-12',
      first_detected_at: '2025-08-12',
    },
  ],
  crm_deal_facts: [{ name: 'TMA SI RH', is_won: false, closed_at: '2024-06-01', last_activity_at: null }],
  canonical_trigger_events: [{ evidence: 'Affaire cloud sans activité depuis 9 mois', occurred_at: '2026-01-04' }],
  rag_documents: [{ title: 'CR comité de pilotage', created_at: '2026-09-01' }],
  missions: [{ label: 'Architecte data', started_on: '2024-01-08', created_at: '2023-12-01' }],
  project_needs: [
    { title: 'Migration paie cloud', created_at: '2026-06-01' },
    { title: 'Migration paie cloud', created_at: '2025-06-01' },
  ],
  notes: [{ body: 'Le DSI part en juin', created_at: '2026-02-01', is_meeting: false }],
  activities: [
    {
      kind: 'email',
      direction: 'outbound',
      subject: 'Point TMA',
      occurred_at: '2026-09-02T09:00:00Z',
      contact_id: 'c1',
    },
  ],
  account_feedback: [{ target_ref: 'Angle cyber', verdict: 'inutile', note: 'Déjà couvert', created_at: '2026-04-01' }],
}

describe('#4069.1 — AccountFactsService, le lecteur unique des faits du compte', () => {
  it('agrège les familles A, B, D, E, F, G en faits conformes au contrat, les plus pesants d’abord', async () => {
    const { repo } = fakeRepo(ROWS)
    const market = jest.fn(async () => ({
      status: 'ok' as const,
      coverage: { covered: true, esnObserved: [{ esnName: 'Alpha' }], roleFamilies: [], periodEnd: '2026-06-30' },
    }))
    const result = await new AccountFactsService(repo, market as never).forAccount({
      workspaceId: WS,
      userId: USER,
      accountId: ACCOUNT,
      asOf: AS_OF,
    })
    expect(accountFactsSchema.safeParse(result).success).toBe(true)
    const kinds = new Set(result?.facts.map(f => f.kind))
    for (const k of [
      'hiring',
      'deal_lost',
      'deal_dormant',
      'document',
      'mission',
      'need',
      'note',
      'correction',
      'market_observation',
      'exchange',
    ])
      expect(kinds).toContain(k)
    const weights = result?.facts.map(f => f.weight) ?? []
    expect([...weights].sort((a, b) => b - a)).toEqual(weights)
    // Le besoin récurrent passe devant un fait isolé plus récent (le document de septembre).
    const needIdx = result?.facts.findIndex(f => f.label === 'Migration paie cloud') ?? -1
    const docIdx = result?.facts.findIndex(f => f.kind === 'document') ?? -1
    expect(needIdx).toBeLessThan(docIdx)
    expect(result?.asOf).toBe(AS_OF.toISOString())
  })

  it('NON — chaque lecture est bornée à l’ESPACE et au COMPTE, jamais `where id` seul', async () => {
    const { repo, calls } = fakeRepo(ROWS)
    await new AccountFactsService(repo).forAccount({ workspaceId: WS, userId: USER, accountId: ACCOUNT, asOf: AS_OF })
    expect(calls.length).toBeGreaterThanOrEqual(9)
    for (const call of calls) {
      expect(call.params[0]).toBe(WS)
      expect(call.params[1]).toBe(ACCOUNT)
      expect(call.sql).toMatch(/workspace_id = \$1/)
    }
  })

  it('NON — les échanges se lisent en MÉTADONNÉES : la requête ne sélectionne jamais le corps (#4072.2)', async () => {
    const { repo, calls } = fakeRepo(ROWS)
    await new AccountFactsService(repo).forAccount({ workspaceId: WS, userId: USER, accountId: ACCOUNT, asOf: AS_OF })
    const exchanges = calls.find(c => /FROM activities/.test(c.sql))
    expect(exchanges).toBeDefined()
    expect(exchanges?.sql).not.toMatch(/\bbody\b/)
    expect(exchanges?.sql).not.toMatch(/\bcontacts\b/)
    const withWho = (
      await new AccountFactsService(repo).forAccount({ workspaceId: WS, userId: USER, accountId: ACCOUNT, asOf: AS_OF })
    )?.facts.find(f => f.kind === 'exchange')
    expect(withWho?.label).toBe('E-mail envoyé à Jeanne — « Point TMA »')
  })

  it('NON — un document PERSONNEL n’est lu que pour son auteur (le demandeur)', async () => {
    const { repo, calls } = fakeRepo(ROWS)
    await new AccountFactsService(repo).forAccount({ workspaceId: WS, userId: USER, accountId: ACCOUNT, asOf: AS_OF })
    const docs = calls.find(c => /FROM rag_documents/.test(c.sql))
    expect(docs?.sql).toMatch(/scope = 'personal' AND d\.user_id = \$3/)
    expect(docs?.sql).not.toMatch(/scope IN \([^)]*personal/)
    expect(docs?.params[2]).toBe(USER)
  })

  it('NON — un compte hors de l’espace ne lit RIEN d’autre et rend null', async () => {
    const { repo, calls } = fakeRepo(ROWS, { account: false })
    const result = await new AccountFactsService(repo).forAccount({
      workspaceId: WS,
      userId: USER,
      accountId: ACCOUNT,
      asOf: AS_OF,
    })
    expect(result).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it('une famille en panne n’efface pas les autres (et ne s’invente pas)', async () => {
    const { repo } = fakeRepo(ROWS, { fail: 'missions' })
    const result = await new AccountFactsService(repo).forAccount({
      workspaceId: WS,
      userId: USER,
      accountId: ACCOUNT,
      asOf: AS_OF,
    })
    expect(result?.facts.some(f => f.kind === 'mission')).toBe(false)
    expect(result?.facts.some(f => f.kind === 'hiring')).toBe(true)
  })

  it('NON — aucun fait ne porte de champ de provenance', async () => {
    const { repo } = fakeRepo(ROWS)
    const result = await new AccountFactsService(repo).forAccount({
      workspaceId: WS,
      userId: USER,
      accountId: ACCOUNT,
      asOf: AS_OF,
    })
    for (const f of result?.facts ?? [])
      expect(Object.keys(f).sort()).toEqual(['ageDays', 'date', 'kind', 'label', 'weight'])
  })
})

// #4072.1
describe('AccountFactsService.knownPeople — l’organigramme sait qui est déjà connu', () => {
  const build = (opts: { account?: boolean; contacts?: unknown[]; byId?: unknown[]; missions?: unknown[] } = {}) => {
    const find = jest
      .fn()
      .mockResolvedValueOnce(opts.contacts ?? [])
      .mockResolvedValueOnce(opts.byId ?? [])
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (/FROM accounts\b/.test(sql)) return opts.account === false ? [] : [{ company_name: 'Sanofi' }]
      if (/FROM missions\b/.test(sql)) return opts.missions ?? []
      return []
    })
    const service = new AccountFactsService({ manager: { query, getRepository: () => ({ find }) } } as never)
    return { service, query, find }
  }
  const args = { workspaceId: WS, accountId: ACCOUNT }

  it('marque les contacts déjà dans le CRM et les interlocuteurs de missions passées, fusionnés par nom', async () => {
    const { service } = build({
      contacts: [
        { id: 'c1', full_name: 'Hélène Garreau', crm_record_id: 'crm-1', crm_synced_at: new Date('2026-05-01') },
      ],
      missions: [
        {
          client_manager_contact_id: 'c3',
          cra_contact_id: null,
          billing_contact_id: null,
          started_on: '2024-01-08',
          created_at: '2023-12-01',
        },
      ],
      byId: [{ id: 'c3', full_name: 'helene GARREAU' }],
    })
    const result = await service.knownPeople(args)
    expect(result?.people).toEqual([
      { fullName: 'Hélène Garreau', reasons: ['crm', 'mission'], lastDate: '2026-05-01' },
    ])
  })

  it('un compte absent de l’espace rend null ; une lecture qui échoue ne casse pas, rend une liste vide', async () => {
    expect(await build({ account: false }).service.knownPeople(args)).toBeNull()
    const query = jest.fn(async (sql: string) => {
      if (/FROM accounts\b/.test(sql)) return [{ company_name: 'X' }]
      throw new Error('boom')
    })
    const service = new AccountFactsService({
      manager: { query, getRepository: () => ({ find: jest.fn().mockRejectedValue(new Error('boom')) }) },
    } as never)
    expect(await service.knownPeople(args)).toEqual({ people: [] })
  })

  it('NON — chaque lecture est bornée à l’espace ET au compte', async () => {
    const { service, query, find } = build({ missions: [] })
    await service.knownPeople(args)
    const missions = query.mock.calls.find(c => /FROM missions\b/.test(String(c[0])))
    expect(String(missions?.[0])).toMatch(/workspace_id = \$1/)
    expect(missions?.[1]).toEqual([WS, ACCOUNT])
    expect(find.mock.calls[0]?.[0]?.where).toMatchObject({ workspace_id: WS, account_id: ACCOUNT })
  })
})
