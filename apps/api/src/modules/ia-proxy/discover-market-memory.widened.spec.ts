import type { DiscoverCandidate } from '@bellum/contracts'
import type { MarketMemoryService } from '../market-memory/market-memory.service'
import { DiscoverMarketMemoryService } from './discover-market-memory.service'

/**
 * #4434 (épopée #4433) — « React » à zéro exact remonte un compte qui recrute en JavaScript, étiqueté
 * « proche : JavaScript ». Son offre EST la preuve de son voisin : le filtre « technologies observées »
 * ne doit pas l'écarter faute de citer React. Un compte exact sans preuve, lui, reste soumis au filtre.
 */
function candidate(siren: string, overrides: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: `ACME ${siren}`,
    siren,
    nafCode: '62.01Z',
    sector: null,
    city: 'Paris',
    department: '75',
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

const JS_PROOF = {
  skill: 'JavaScript',
  offerCount: 1,
  latestOffer: { title: 'Développeur JavaScript', city: 'Paris', date: '2026-10-16', url: null, source: null },
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

describe('#4434 — le filtre technologies garde un compte élargi par compétence', () => {
  it('garde le compte « proche : JavaScript » remonté pour React', async () => {
    const service = new DiscoverMarketMemoryService(memoryWithoutStacks() as unknown as MarketMemoryService)
    const widened = candidate('552100554', {
      skillEvidence: JS_PROOF,
      widenedBy: { axis: 'skill', tier: 1, code: 'javascript' },
    })
    const result = await service.applyFilters([widened], { technologiesObserved: ['React'] })
    expect(result.candidates.map(c => c.siren)).toEqual(['552100554'])
  })

  it('dit NON à un compte qui porte la preuve JavaScript SANS étiquette d’élargissement', async () => {
    const service = new DiscoverMarketMemoryService(memoryWithoutStacks() as unknown as MarketMemoryService)
    const result = await service.applyFilters([candidate('552100554', { skillEvidence: JS_PROOF })], {
      technologiesObserved: ['React'],
    })
    expect(result.candidates).toEqual([])
  })
})
