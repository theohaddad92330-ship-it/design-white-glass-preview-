import { McpSignalsService } from './mcp-signals.service'

const account = (over: Record<string, unknown> = {}) => ({
  id: 'acc-1',
  company_name: 'Acme',
  website: 'https://acme.fr',
  priority_score: 70,
  primary_signal: 'Nouveau DSI nommé',
  signal_freshness: { state: 'current' },
  next_action_label: null,
  ...over,
})

const coverage = (over: Record<string, unknown> = {}) => ({
  covered: true,
  marketPaths: 14,
  esnObserved: [{ esnName: 'Une ESN', persons: 4, certainty: 'moyenne' }],
  observedStack: [{ techno: 'Python', persons: 3 }],
  roleFamilies: [{ family: 'Data', persons: 5 }],
  exEsnPresent: null,
  observedZone: { city: 'Lyon' },
  datasetVersion: 'v10-2026-03',
  periodEnd: '2026-02',
  ...over,
})

/** Ce que fait le contrôleur : lire le portefeuille cloisonné et le tendre au service. */
const ctxOf = (accounts: { findAccountsByWorkspace: jest.Mock }, businessUnitScope: unknown = null) => ({
  workspaceId: 'ws-1',
  businessUnitScope: businessUnitScope as never,
  listPortfolio: (filters: { q?: string; limit: number }) =>
    accounts.findAccountsByWorkspace('ws-1', filters, null, undefined, businessUnitScope),
})

function build(opts: { accounts?: unknown[]; search?: unknown } = {}) {
  const accounts = {
    findAccountsByWorkspace: jest.fn().mockResolvedValue({ data: opts.accounts ?? [account()], pagination: {} }),
  }
  const market = {
    searchByFilters: jest.fn().mockResolvedValue(
      opts.search ?? {
        status: 'ok',
        matches: [{ companyName: 'Globex', coverage: coverage() }],
        truncated: false,
      },
    ),
    resolveDetailed: jest.fn(),
    coverageFor: jest.fn(),
  }
  const service = new McpSignalsService(market as never)
  return { service, accounts, market, ctx: ctxOf(accounts) }
}

describe('McpSignalsService.findOpportunities', () => {
  it('lit le portefeuille de l’espace avec le cloisonnement, jamais sans workspace', async () => {
    const { service, accounts } = build()
    await service.findOpportunities(ctxOf(accounts, { businessUnitIds: ['bu-1'] }), {})
    expect(accounts.findAccountsByWorkspace).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({ limit: 100 }),
      null,
      undefined,
      { businessUnitIds: ['bu-1'] },
    )
  })

  it('sans compétence : cherche le recours externe observé; avec : une recherche par compétence', async () => {
    const { service, market, ctx } = build()
    await service.findOpportunities(ctx, {})
    expect(market.searchByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ externalRecourseObserved: true }),
      expect.objectContaining({ workspaceId: 'ws-1' }),
    )
    market.searchByFilters.mockClear()
    await service.findOpportunities(ctx, { skills: 'data, Python' })
    expect(market.searchByFilters).toHaveBeenCalledTimes(2)
    expect(market.searchByFilters.mock.calls.map(call => call[0].technology)).toEqual(['data', 'Python'])
  })

  it('rattache à la LECTURE le compte du portefeuille via la route résolue, sans écrire', async () => {
    const { service, ctx } = build({
      search: {
        status: 'ok',
        matches: [{ companyName: 'Acme SA', accountRoute: '/accounts/acc-1', coverage: coverage() }],
        truncated: false,
      },
    })
    const out = await service.findOpportunities(ctx, {})
    expect(out.items).toHaveLength(1)
    expect(out.items[0]).toMatchObject({ account_id: 'acc-1', company_name: 'Acme' })
    expect(out.items[0]?.signals.map(s => s.type)).toEqual(
      expect.arrayContaining(['portfolio_signal', 'market_external_recourse']),
    )
  })

  it('mémoire marché indisponible : le dit, et rend quand même le portefeuille (jamais « rien »)', async () => {
    const { service, ctx } = build({ search: { status: 'unavailable', reason: 'read_failed' } })
    const out = await service.findOpportunities(ctx, {})
    expect(out.market_memory).toBe('indisponible')
    expect(out.items.map(i => i.company_name)).toEqual(['Acme'])
  })

  it('ne laisse sortir ni date de corpus, ni version, ni zone, ni nom d’ESN', async () => {
    const { service, ctx } = build()
    const json = JSON.stringify(await service.findOpportunities(ctx, {}))
    expect(json).not.toMatch(/v10-2026|2026-02|Lyon|Une ESN|datasetVersion|periodEnd/)
  })
})

describe('McpSignalsService.marketSignals', () => {
  it('rend les signaux d’une entreprise couverte, hors portefeuille => account_id null', async () => {
    const { service, market, accounts, ctx } = build({ accounts: [] })
    market.resolveDetailed.mockResolvedValue({ status: 'resolved', companyKey: 'globex', strength: 'domain' })
    market.coverageFor.mockResolvedValue({ status: 'ok', coverage: coverage() })
    accounts.findAccountsByWorkspace.mockResolvedValue({ data: [], pagination: {} })
    const out = await service.marketSignals(ctx, 'Globex')
    expect(out).toMatchObject({
      company_name: 'Globex',
      covered: true,
      account_id: null,
      external_recourse: true,
      observed_stack: ['Python'],
      role_families: ['Data'],
    })
    expect(JSON.stringify(out)).not.toMatch(/v10-2026|2026-02|Lyon|Une ESN/)
  })

  it('compte du portefeuille rattaché UNIQUEMENT quand sa clé résolue est la même', async () => {
    const { service, market, accounts, ctx } = build()
    accounts.findAccountsByWorkspace.mockResolvedValue({
      data: [account(), account({ id: 'acc-2', company_name: 'Acme Conseil' })],
      pagination: {},
    })
    market.resolveDetailed.mockImplementation(async (lookup: { ref: string }) => ({
      status: 'resolved',
      companyKey: lookup.ref === 'acc-2' ? 'autre' : 'acme',
      strength: 'domain',
    }))
    market.coverageFor.mockResolvedValue({ status: 'ok', coverage: coverage() })
    const out = await service.marketSignals(ctx, 'Acme')
    expect(out).toMatchObject({ account_id: 'acc-1' })
  })

  it('non couverte : covered=false et aucun nombre inventé', async () => {
    const { service, market, ctx } = build()
    market.resolveDetailed.mockResolvedValue({ status: 'unresolved' })
    market.coverageFor.mockResolvedValue({
      status: 'ok',
      coverage: {
        covered: false,
        marketPaths: null,
        esnObserved: [],
        observedStack: [],
        roleFamilies: [],
        exEsnPresent: null,
      },
    })
    const out = await service.marketSignals(ctx, 'Inconnue')
    expect(out).toMatchObject({ covered: false, external_recourse: null, observed_stack: null, role_families: null })
  })

  it('lecture en panne : status indisponible, jamais « non couverte »', async () => {
    const { service, market, ctx } = build()
    market.resolveDetailed.mockResolvedValue({ status: 'unavailable', reason: 'read_failed' })
    market.coverageFor.mockResolvedValue({ status: 'unavailable', reason: 'read_failed' })
    const out = await service.marketSignals(ctx, 'Acme')
    expect(out).toMatchObject({ status: 'indisponible' })
    expect(out).not.toHaveProperty('covered')
  })
})
