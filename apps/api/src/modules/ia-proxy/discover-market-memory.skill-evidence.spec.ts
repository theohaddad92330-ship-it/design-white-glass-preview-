import type { DiscoverCandidate } from '@bellum/contracts'
import type { MarketMemoryService } from '../market-memory/market-memory.service'
import { DiscoverMarketMemoryService } from './discover-market-memory.service'

/**
 * COMPETENCE-TROUVE (Louis 20/10/2026) — « SAP » + Île-de-France et Grand Est rendait 0 compte : le filtre
 * « technologies observées » écartait tout compte sans pile connue en mémoire marché, y compris ceux
 * que l'IA venait de TROUVER par leurs offres SAP. L'offre EST la preuve de la techno : un compte qui la
 * porte (`skillEvidence`) passe le filtre, même sans pile en mémoire marché — et seulement sur SA techno.
 */
function candidate(siren: string, overrides: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: `ACME ${siren}`,
    siren,
    nafCode: '46.69B',
    sector: null,
    city: 'Bartenheim',
    department: '68',
    headcountRange: null,
    creationDate: null,
    score: 50,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...overrides,
  } as DiscoverCandidate
}

const SAP_PROOF = {
  skill: 'SAP',
  offerCount: 2,
  latestOffer: {
    title: 'Business Analyst SAP SD',
    city: 'Bartenheim',
    date: '2026-10-16',
    url: null,
    source: 'adzuna',
  },
}

function memoryWithoutStacks() {
  return {
    observedStacksFor: jest.fn().mockResolvedValue({
      status: 'ok',
      stacks: new Map(),
      technoFrequency: new Map(),
      corpusCompanies: 10,
    }),
    esnObservedManyFor: jest.fn(),
  }
}

describe('COMPETENCE-TROUVE — le filtre technologies garde un compte prouvé par offre', () => {
  it('garde le compte trouvé par ses offres SAP, sans pile en mémoire marché, et ne le compte pas « non mesuré »', async () => {
    const service = new DiscoverMarketMemoryService(memoryWithoutStacks() as unknown as MarketMemoryService)

    const result = await service.applyFilters([candidate('433091839', { skillEvidence: SAP_PROOF }), candidate('2')], {
      technologiesObserved: ['SAP'],
    })

    expect(result.candidates.map(c => c.siren)).toEqual(['433091839'])
    // Le compte SANS preuve ni pile reste « non mesuré » (dit, jamais exclu en silence) ; le prouvé n'y entre pas.
    expect(result.degraded).toEqual([
      {
        source: 'market-memory',
        reason: 'market_memory_unmeasured',
        count: 1,
        kind: 'unmeasured',
        fields: ['technologiesObserved'],
      },
    ])
  })

  it('sait dire NON : une preuve sur une AUTRE techno ne passe pas le filtre', async () => {
    const service = new DiscoverMarketMemoryService(memoryWithoutStacks() as unknown as MarketMemoryService)

    const result = await service.applyFilters([candidate('433091839', { skillEvidence: SAP_PROOF })], {
      technologiesObserved: ['salesforce'],
    })

    expect(result.candidates).toEqual([])
  })

  it('mémoire marché en panne : le compte prouvé reste, comme tous les autres', async () => {
    const service = new DiscoverMarketMemoryService(undefined)

    const result = await service.applyFilters([candidate('433091839', { skillEvidence: SAP_PROOF })], {
      technologiesObserved: ['SAP'],
    })

    expect(result.candidates.map(c => c.siren)).toEqual(['433091839'])
  })
})
