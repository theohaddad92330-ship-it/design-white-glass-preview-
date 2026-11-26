import { buildOpportunities, parseSkills } from './mcp-opportunities'

const portfolioRow = (over: Record<string, unknown> = {}) => ({
  account_id: 'acc-1',
  company_name: 'Acme',
  priority_score: 80,
  primary_signal: 'Levée de fonds série B',
  signal_freshness: 'current' as const,
  next_action_label: null,
  ...over,
})
const marketRow = (over: Record<string, unknown> = {}) => ({
  company_name: 'Globex',
  account_id: null,
  market_paths: 12,
  external_recourse: true,
  observed_stack: ['Python', 'Azure'],
  role_families: ['Data'],
  ...over,
})

describe('parseSkills', () => {
  it('découpe un texte libre, dédoublonne et borne à 5', () => {
    expect(parseSkills('data, Python ; Azure\nPython, a, b, c, d')).toEqual(['data', 'Python', 'Azure', 'a', 'b'])
  })
  it('vide ou absent => []', () => {
    expect(parseSkills(undefined)).toEqual([])
    expect(parseSkills('  ,; ')).toEqual([])
  })
})

describe('buildOpportunities', () => {
  it('classe par score décroissant et borne le score à 0-100', () => {
    const out = buildOpportunities({
      portfolio: [portfolioRow({ account_id: 'a', company_name: 'Faible', priority_score: 10 }), portfolioRow()],
      market: [],
    })
    expect(out.map(o => o.company_name)).toEqual(['Acme', 'Faible'])
    for (const o of out) expect(o.score).toBeGreaterThanOrEqual(0)
    for (const o of out) expect(o.score).toBeLessThanOrEqual(100)
  })

  it('une ligne sans aucun signal ne produit AUCUNE ligne (on n’affiche pas ce qu’on n’a pas)', () => {
    const out = buildOpportunities({
      portfolio: [portfolioRow({ primary_signal: null, priority_score: 90 })],
      market: [marketRow({ external_recourse: false, observed_stack: [], market_paths: 0 })],
    })
    expect(out).toEqual([])
  })

  it('chaque item porte signals typés, why et next_step', () => {
    const [o] = buildOpportunities({ portfolio: [portfolioRow()], market: [] })
    expect(o?.account_id).toBe('acc-1')
    expect(o?.signals[0]).toMatchObject({ type: 'portfolio_signal', libelle: 'Levée de fonds série B', force: 'forte' })
    expect(o?.why).toContain('Levée de fonds série B')
    expect(o?.next_step.length).toBeGreaterThan(0)
  })

  it('fusionne la mémoire marché sur le compte du portefeuille, sans doublon', () => {
    const out = buildOpportunities({
      portfolio: [portfolioRow()],
      market: [marketRow({ company_name: 'Acme', account_id: 'acc-1' })],
    })
    expect(out).toHaveLength(1)
    expect(out[0]?.signals.map(s => s.type)).toEqual(
      expect.arrayContaining(['portfolio_signal', 'market_external_recourse']),
    )
  })

  it('une entreprise marché hors portefeuille a account_id null et propose de lancer une analyse', () => {
    const [o] = buildOpportunities({ portfolio: [], market: [marketRow()] })
    expect(o?.account_id).toBeNull()
    expect(o?.next_step).toMatch(/analyse/i)
  })

  it('le nombre de parcours marché ne pèse jamais dans le score (présence, pas volume)', () => {
    const [a] = buildOpportunities({ portfolio: [], market: [marketRow({ market_paths: 3 })] })
    const [b] = buildOpportunities({ portfolio: [], market: [marketRow({ market_paths: 3000 })] })
    expect(a?.score).toBe(b?.score)
  })

  it('skills : un recoupement de pile observée est un signal fort; sans recoupement, hors marché', () => {
    const out = buildOpportunities({
      portfolio: [],
      market: [marketRow(), marketRow({ company_name: 'Initech', observed_stack: ['Cobol'] })],
      skills: ['python'],
    })
    expect(out.map(o => o.company_name)).toEqual(['Globex'])
    expect(out[0]?.signals.some(s => s.type === 'market_stack_match' && s.force === 'forte')).toBe(true)
  })

  it('skills : un compte du portefeuille sans lecture marché n’est pas vérifiable => exclu', () => {
    const out = buildOpportunities({ portfolio: [portfolioRow()], market: [], skills: ['python'] })
    expect(out).toEqual([])
  })

  it('filtres in_portfolio, q et limit', () => {
    const input = {
      portfolio: [portfolioRow()],
      market: [marketRow(), marketRow({ company_name: 'Hooli' })],
    }
    expect(buildOpportunities({ ...input, inPortfolio: true }).map(o => o.company_name)).toEqual(['Acme'])
    expect(buildOpportunities({ ...input, inPortfolio: false })).toHaveLength(2)
    expect(buildOpportunities({ ...input, q: 'hool' }).map(o => o.company_name)).toEqual(['Hooli'])
    expect(buildOpportunities({ ...input, limit: 1 })).toHaveLength(1)
  })

  it('ne laisse fuir ni identité de personne, ni date de corpus', () => {
    const json = JSON.stringify(buildOpportunities({ portfolio: [portfolioRow()], market: [marketRow()] }))
    expect(json).not.toMatch(/dataset|period|\d{4}-\d{2}-\d{2}|full_name|linkedin/i)
  })

  it('priority_score null : pas de 0 inventé, la ligne reste portée par son signal', () => {
    const [o] = buildOpportunities({ portfolio: [portfolioRow({ priority_score: null })], market: [] })
    expect(o).toBeDefined()
    expect(o?.score).toBeGreaterThan(0)
  })
})
