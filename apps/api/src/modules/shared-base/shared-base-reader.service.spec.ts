import { SharedBaseReaderService } from './shared-base-reader.service'

// P05.a (#3246, lot 09/10) — la lecture de la base commune : le segment le plus
// fin qui atteint le seuil, la salle de démo isolée du réel, jamais un zéro.
describe('SharedBaseReaderService.actionOutcomesElsewhere', () => {
  const build = (opts: {
    isDemo?: boolean
    account?: { naf_code: string | null; employees: string | null; group_role?: string | null }
    rows: unknown[]
  }) => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM workspaces')) return [{ is_demo: opts.isDemo ?? false }]
      if (sql.includes('FROM accounts')) return opts.account ? [opts.account] : []
      return opts.rows
    })
    return { reader: new SharedBaseReaderService({ query } as never), query }
  }
  const cell = (sector_key: string, size_band: string, value: string, k: number, positive = 5, judged = 9) => ({
    value,
    sector_key,
    size_band,
    positive,
    judged,
    contributing_workspaces: k,
  })

  it('le segment du compte quand il atteint le seuil', async () => {
    const { reader } = build({
      account: { naf_code: '64.19Z', employees: '300' },
      rows: [cell('naf_64', 'eti', 'relance', 3, 9, 12), cell('all', 'all', 'relance', 7, 20, 40)],
    })
    const result = await reader.actionOutcomesElsewhere('w-1', 'cadence', 'acc-1')
    expect(result).toEqual({
      basis: 'shared_anonymous_base',
      minWorkspaces: 3,
      dimension: 'cadence',
      status: 'shared',
      segment: { sector: 'naf_64', sizeBand: 'eti' },
      contributingWorkspaces: 3,
      values: [{ value: 'relance', positive: 9, judged: 12, contributingWorkspaces: 3 }],
    })
  })

  it('sait dire NON — une ligne sous le seuil est ignorée, on remonte au total', async () => {
    const { reader } = build({
      account: { naf_code: '64.19Z', employees: '300' },
      rows: [cell('naf_64', 'eti', 'relance', 2), cell('all', 'all', 'relance', 4)],
    })
    const result = await reader.actionOutcomesElsewhere('w-1', 'cadence', 'acc-1')
    expect(result.status === 'shared' && result.segment).toEqual({ sector: 'all', sizeBand: 'all' })
  })

  it('rien au-dessus du seuil : « pas assez de données communes », jamais une liste de zéros', async () => {
    const { reader } = build({ rows: [] })
    expect(await reader.actionOutcomesElsewhere('w-1', 'route')).toEqual({
      basis: 'shared_anonymous_base',
      minWorkspaces: 3,
      dimension: 'route',
      status: 'not_enough_shared_data',
    })
  })

  it('la salle de démonstration lit scope = demo, jamais le réel', async () => {
    const { reader, query } = build({ isDemo: true, rows: [] })
    await reader.actionOutcomesElsewhere('w-demo', 'priority')
    const call = query.mock.calls.find(([sql]) => String(sql).includes('shared_action_outcome_aggregates'))
    expect(call?.[1]).toEqual(['demo', 'priority'])
  })
})

// P05.b (#3246, lot 09/10) — « dans la base commune » pour les cas similaires.
describe('SharedBaseReaderService.caseOutcomesElsewhere', () => {
  const build = (rows: unknown[], account = { naf_code: '62.01Z', employees: '300', group_role: 'filiale' }) => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM workspaces')) return [{ is_demo: false }]
      if (sql.includes('FROM accounts')) return [account]
      return rows
    })
    return new SharedBaseReaderService({ query } as never)
  }
  const line = (dimension: string, value: string, k: number) => ({
    dimension,
    value,
    won: 5,
    lost: 3,
    contributing_workspaces: k,
  })

  it('une ligne par dimension du compte présente dans la base commune', async () => {
    const reader = build([line('sector', 'naf_62', 4), line('sector', 'naf_64', 9), line('group_role', 'filiale', 3)])
    expect(await reader.caseOutcomesElsewhere('w-1', 'acc-1')).toEqual({
      basis: 'shared_anonymous_base',
      minWorkspaces: 3,
      status: 'shared',
      lines: [
        { dimension: 'sector', value: 'naf_62', won: 5, lost: 3, contributingWorkspaces: 4 },
        { dimension: 'group_role', value: 'filiale', won: 5, lost: 3, contributingWorkspaces: 3 },
      ],
    })
  })

  it('sait dire NON — une ligne sous le seuil, ou d’un autre secteur, ne sort pas', async () => {
    const reader = build([line('sector', 'naf_62', 2), line('sector', 'naf_64', 9)])
    expect(await reader.caseOutcomesElsewhere('w-1', 'acc-1')).toEqual({
      basis: 'shared_anonymous_base',
      minWorkspaces: 3,
      status: 'not_enough_shared_data',
    })
  })
})

// BELLUM-API-K — une affaire par compte ne relit pas la base commune N fois.
describe('SharedBaseReaderService.caseOutcomesElsewhereFor', () => {
  it('lit le périmètre et les cellules UNE fois pour N comptes, résultat identique à la lecture unitaire', async () => {
    const rows = [{ dimension: 'sector', value: 'naf_62', won: 5, lost: 3, contributing_workspaces: 4 }]
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM workspaces')) return [{ is_demo: false }]
      if (sql.includes('FROM accounts')) return [{ naf_code: '62.01Z', employees: null, group_role: null }]
      return rows
    })
    const reader = new SharedBaseReaderService({ query } as never)
    const of = reader.caseOutcomesElsewhereFor('w-1')
    const readings = await Promise.all(['a1', 'a2', 'a3'].map(of))
    const single = await reader.caseOutcomesElsewhere('w-1', 'a1')
    expect(readings).toEqual([single, single, single])
    const sqls = query.mock.calls.map(c => c[0])
    // 3 lectures groupées + 3 lectures de la lecture unitaire de contrôle
    expect(sqls.filter(q => q.includes('shared_case_outcome_aggregates'))).toHaveLength(2)
    expect(sqls.filter(q => q.includes('FROM workspaces'))).toHaveLength(2)
  })
})

// P05.c (#3246, lot 09/10) — les signaux qui précèdent une affaire, ailleurs.
describe('SharedBaseReaderService.signalPrecedenceElsewhere', () => {
  const build = (rows: unknown[]) => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM workspaces')) return [{ is_demo: false }]
      if (sql.includes('FROM accounts')) return [{ naf_code: '64.19Z', employees: null, group_role: null }]
      return rows
    })
    return { reader: new SharedBaseReaderService({ query } as never), query }
  }
  const cell = (signal_type: string, sector_key: string, k: number) => ({
    signal_type,
    sector_key,
    signals: 11,
    followed_by_deal: 4,
    contributing_workspaces: k,
  })

  it('le secteur du compte quand il atteint le seuil, sinon le total ; un type absent ne fait aucune ligne', async () => {
    const { reader, query } = build([
      cell('budget', 'naf_64', 3),
      cell('budget', 'all', 6),
      cell('nomination', 'naf_64', 2),
      cell('nomination', 'all', 5),
    ])
    const result = await reader.signalPrecedenceElsewhere('w-1', ['Budget', 'nomination', 'projet'], 'acc-1')
    expect(result).toEqual({
      basis: 'shared_anonymous_base',
      minWorkspaces: 3,
      windowDays: 90,
      status: 'shared',
      lines: [
        { signalType: 'budget', sector: 'naf_64', signals: 11, followedByDeal: 4, contributingWorkspaces: 3 },
        { signalType: 'nomination', sector: 'all', signals: 11, followedByDeal: 4, contributingWorkspaces: 5 },
      ],
    })
    const read = query.mock.calls.find(([sql]) => String(sql).includes('shared_signal_deal_aggregates'))
    expect(read?.[1]).toEqual(['live', ['budget', 'nomination', 'projet']])
  })

  it('sait dire NON — sous le seuil partout : « pas assez de données communes »', async () => {
    const { reader } = build([cell('budget', 'all', 2)])
    expect(await reader.signalPrecedenceElsewhere('w-1', ['budget'])).toMatchObject({
      status: 'not_enough_shared_data',
    })
  })

  it('aucun type demandé : rien n’est lu', async () => {
    const { reader, query } = build([])
    expect(await reader.signalPrecedenceElsewhere('w-1', [])).toMatchObject({ status: 'not_enough_shared_data' })
    expect(query).not.toHaveBeenCalled()
  })
})

// #4286.15.c (Louis 22/10/2026) — `market_pattern` : pour CHAQUE famille de métier, la cellule la plus
// fine du segment du compte qui atteint trois espaces ; « observé dans N espaces », jamais un taux.
describe('SharedBaseReaderService.marketPatternsElsewhere', () => {
  const build = (opts: {
    isDemo?: boolean
    account?: {
      naf_code: string | null
      employees: string | null
      headquarters?: string | null
      address?: string | null
    }
    rows: unknown[]
  }) => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM workspaces')) return [{ is_demo: opts.isDemo ?? false }]
      if (sql.includes('FROM accounts')) return opts.account ? [opts.account] : []
      return opts.rows
    })
    return { reader: new SharedBaseReaderService({ query } as never), query }
  }
  const cell = (
    topic: string,
    sector_key: string,
    size_band: string,
    region_key: string,
    k: number,
    observations = 6,
  ) => ({
    topic,
    sector_key,
    size_band,
    region_key,
    observations,
    contributing_workspaces: k,
  })
  const account = { naf_code: '64.19Z', employees: '1 200', headquarters: '29 boulevard Haussmann, 75009 Paris' }

  it('la cellule la plus fine qui atteint le seuil, par famille de métier, avec son libellé', async () => {
    const { reader, query } = build({
      account,
      rows: [
        cell('data', 'naf_64', 'eti', 'ile_de_france', 3, 4),
        cell('data', 'all', 'all', 'all', 9, 40),
        cell('cloud', 'naf_64', 'eti', 'ile_de_france', 2, 3),
        cell('cloud', 'naf_64', 'all', 'all', 4, 7),
      ],
    })
    const result = await reader.marketPatternsElsewhere('w-1', 'acc-1')
    expect(result).toEqual({
      basis: 'shared_anonymous_base',
      minWorkspaces: 3,
      windowDays: 180,
      status: 'shared',
      lines: [
        {
          topic: 'cloud',
          sectorKey: 'naf_64',
          sizeBand: 'all',
          regionKey: 'all',
          observations: 7,
          contributingWorkspaces: 4,
          observedIn: 'observé dans 4 espaces',
        },
        {
          topic: 'data',
          sectorKey: 'naf_64',
          sizeBand: 'eti',
          regionKey: 'ile_de_france',
          observations: 4,
          contributingWorkspaces: 3,
          observedIn: 'observé dans 3 espaces',
        },
      ],
    })
    const read = query.mock.calls.find(([sql]) => sql.includes('shared_market_pattern_aggregates'))
    expect(read?.[1]?.[0]).toBe('live')
  })

  it('sait dire NON — une cellule sous trois espaces ne sort pas, même stockée ; rien = « pas assez »', async () => {
    const { reader } = build({
      account,
      rows: [cell('data', 'naf_64', 'eti', 'ile_de_france', 2), cell('data', 'all', 'all', 'all', 2)],
    })
    expect(await reader.marketPatternsElsewhere('w-1', 'acc-1')).toEqual({
      basis: 'shared_anonymous_base',
      minWorkspaces: 3,
      windowDays: 180,
      status: 'not_enough_shared_data',
    })
  })

  it('sait dire NON — une ligne qui porte un champ hors forme (coût, prix) est refusée par la porte', async () => {
    const { reader } = build({ account, rows: [{ ...cell('data', 'all', 'all', 'all', 5), tjm: 650 }] })
    expect((await reader.marketPatternsElsewhere('w-1', 'acc-1')).status).toBe('not_enough_shared_data')
  })

  it('la salle de démonstration lit scope = demo, jamais le réel', async () => {
    const { reader, query } = build({ isDemo: true, account, rows: [] })
    await reader.marketPatternsElsewhere('w-demo', 'acc-1')
    const read = query.mock.calls.find(([sql]) => sql.includes('shared_market_pattern_aggregates'))
    expect(read?.[1]?.[0]).toBe('demo')
  })
})
