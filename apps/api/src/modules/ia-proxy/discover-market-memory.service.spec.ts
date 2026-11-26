import type { DiscoverCandidate } from '@bellum/contracts'
import type { MarketMemoryService } from '../market-memory/market-memory.service'
import { DiscoverMarketMemoryService } from './discover-market-memory.service'

/**
 * #2165.28 / #2165.30 — le filtre SERVEUR de Découvrir sur la mémoire marché,
 * en UN aller-retour par page de résultats (jamais un par ligne — le point
 * d'enrichissement `ia-proxy.controller.ts` est un endpoint vivant, limité en
 * débit).
 *
 * ⚠️ Doctrine c65 (GA-259) : un compte dont la donnée est INCONNUE n'est
 * JAMAIS exclu EN SILENCE — il sort du filtre (on ne peut pas confirmer qu'il
 * correspond), mais son compte remonte dans `degraded[].kind === 'unmeasured'`
 * pour que l'écran le dise. Une panne totale de la mémoire marché laisse les
 * résultats INTACTS (aucun candidat retiré) — c'est la même règle que
 * `withPortfolioState` : une lecture d'agrégat ratée ne détruit jamais une
 * liste déjà correcte.
 */
function candidate(siren: string, overrides: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: `ACME ${siren}`,
    siren,
    nafCode: '62.02A',
    sector: 'Conseil informatique',
    city: 'Lyon',
    department: '69',
    headcountRange: '100 à 199 salariés',
    creationDate: '2005-03-14',
    score: 62,
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

describe('DiscoverMarketMemoryService — #2165.28 / #2165.30', () => {
  it("ne fait AUCUN aller-retour quand rien n'est demandé — no-op strict", async () => {
    const marketMemory = {
      observedStacksFor: jest.fn(),
      esnObservedManyFor: jest.fn(),
    } as unknown as jest.Mocked<Pick<MarketMemoryService, 'observedStacksFor' | 'esnObservedManyFor'>>
    const service = new DiscoverMarketMemoryService(marketMemory as unknown as MarketMemoryService)

    const candidates = [candidate('1')]
    const result = await service.applyFilters(candidates, {})

    expect(result.candidates).toEqual(candidates)
    expect(result.degraded).toEqual([])
    expect(marketMemory.observedStacksFor).not.toHaveBeenCalled()
    expect(marketMemory.esnObservedManyFor).not.toHaveBeenCalled()
  })

  it('garde seulement les comptes dont la pile OBSERVÉE contient la technologie demandée', async () => {
    const marketMemory = {
      observedStacksFor: jest.fn().mockResolvedValue({
        status: 'ok',
        stacks: new Map([
          ['1', ['java', 'spring']],
          ['2', ['php']],
        ]),
        technoFrequency: new Map(),
        corpusCompanies: 10,
      }),
      esnObservedManyFor: jest.fn(),
    } as unknown as jest.Mocked<Pick<MarketMemoryService, 'observedStacksFor' | 'esnObservedManyFor'>>
    const service = new DiscoverMarketMemoryService(marketMemory as unknown as MarketMemoryService)

    const result = await service.applyFilters([candidate('1'), candidate('2')], {
      technologiesObserved: ['java'],
    })

    expect(result.candidates.map(c => c.siren)).toEqual(['1'])
    expect(result.degraded).toEqual([])
  })

  it('garde seulement les comptes avec un recours externe OBSERVÉ (`true` uniquement)', async () => {
    const marketMemory = {
      observedStacksFor: jest.fn(),
      esnObservedManyFor: jest.fn().mockResolvedValue({
        status: 'ok',
        observed: new Map([
          ['1', true],
          ['2', false],
        ]),
      }),
    } as unknown as jest.Mocked<Pick<MarketMemoryService, 'observedStacksFor' | 'esnObservedManyFor'>>
    const service = new DiscoverMarketMemoryService(marketMemory as unknown as MarketMemoryService)

    const result = await service.applyFilters([candidate('1'), candidate('2')], {
      externalRecourseObserved: true,
    })

    expect(result.candidates.map(c => c.siren)).toEqual(['1'])
  })

  it('`externalRecourseObserved: false` ne filtre RIEN — doctrine c65, GA-259', async () => {
    const marketMemory = {
      observedStacksFor: jest.fn(),
      esnObservedManyFor: jest.fn(),
    } as unknown as jest.Mocked<Pick<MarketMemoryService, 'observedStacksFor' | 'esnObservedManyFor'>>
    const service = new DiscoverMarketMemoryService(marketMemory as unknown as MarketMemoryService)

    const candidates = [candidate('1'), candidate('2')]
    const result = await service.applyFilters(candidates, { externalRecourseObserved: false })

    expect(result.candidates).toEqual(candidates)
    expect(marketMemory.esnObservedManyFor).not.toHaveBeenCalled()
  })

  it('un compte non résolu (`null`) est écarté du filtre mais compté — jamais exclu en silence', async () => {
    const marketMemory = {
      observedStacksFor: jest.fn(),
      esnObservedManyFor: jest.fn().mockResolvedValue({
        status: 'ok',
        observed: new Map([
          ['1', true],
          ['2', null],
        ]),
      }),
    } as unknown as jest.Mocked<Pick<MarketMemoryService, 'observedStacksFor' | 'esnObservedManyFor'>>
    const service = new DiscoverMarketMemoryService(marketMemory as unknown as MarketMemoryService)

    const result = await service.applyFilters([candidate('1'), candidate('2')], {
      externalRecourseObserved: true,
    })

    expect(result.candidates.map(c => c.siren)).toEqual(['1'])
    expect(result.degraded).toEqual([
      expect.objectContaining({
        source: 'market-memory',
        kind: 'unmeasured',
        count: 1,
        fields: ['externalRecourseObserved'],
      }),
    ])
  })

  it('une PANNE de la mémoire marché laisse les résultats INTACTS — jamais une liste vidée', async () => {
    const marketMemory = {
      observedStacksFor: jest.fn(),
      esnObservedManyFor: jest.fn().mockResolvedValue({ status: 'unavailable', reason: 'read_failed' }),
    } as unknown as jest.Mocked<Pick<MarketMemoryService, 'observedStacksFor' | 'esnObservedManyFor'>>
    const service = new DiscoverMarketMemoryService(marketMemory as unknown as MarketMemoryService)

    const candidates = [candidate('1'), candidate('2')]
    const result = await service.applyFilters(candidates, { externalRecourseObserved: true })

    expect(result.candidates).toEqual(candidates)
    expect(result.degraded).toEqual([
      expect.objectContaining({
        source: 'market-memory',
        kind: 'unmeasured',
        count: 2,
        fields: ['externalRecourseObserved'],
      }),
    ])
  })

  it('sans service de mémoire marché monté : no-op — les filtres ne font tomber personne', async () => {
    const service = new DiscoverMarketMemoryService(undefined)

    const candidates = [candidate('1'), candidate('2')]
    const result = await service.applyFilters(candidates, {
      technologiesObserved: ['java'],
      externalRecourseObserved: true,
    })

    expect(result.candidates).toEqual(candidates)
    expect(result.degraded.length).toBeGreaterThan(0)
    expect(result.degraded.every(entry => entry.kind === 'unmeasured')).toBe(true)
  })
})

describe('DiscoverMarketMemoryService.annotateObservedStacks — #3408', () => {
  const build = (observedStacksFor: jest.Mock) =>
    new DiscoverMarketMemoryService({ observedStacksFor } as unknown as MarketMemoryService)

  it('pose la pile OBSERVÉE (trois au plus) sur les comptes couverts, en UN aller-retour', async () => {
    const observedStacksFor = jest.fn().mockResolvedValue({
      status: 'ok',
      stacks: new Map([
        ['1', ['Python', 'Kafka', 'AWS', 'Go']],
        ['2', null],
        ['3', []],
      ]),
      technoFrequency: new Map(),
      corpusCompanies: 3,
    })
    const result = await build(observedStacksFor).annotateObservedStacks([
      candidate('1'),
      candidate('2'),
      candidate('3'),
    ])
    expect(observedStacksFor).toHaveBeenCalledTimes(1)
    expect(result[0]?.technologiesObserved).toEqual(['Python', 'Kafka', 'AWS'])
    // sait dire NON : non couvert (null) ou pile non nommée ([]) → aucune clé, jamais une pile devinée
    expect(result[1]).not.toHaveProperty('technologiesObserved')
    expect(result[2]).not.toHaveProperty('technologiesObserved')
  })

  it('une panne de la mémoire marché laisse la liste INTACTE', async () => {
    const down = build(jest.fn().mockResolvedValue({ status: 'unavailable', reason: 'down' }))
    const list = [candidate('1')]
    expect(await down.annotateObservedStacks(list)).toEqual(list)
    const boom = build(jest.fn().mockRejectedValue(new Error('x')))
    expect(await boom.annotateObservedStacks(list)).toEqual(list)
  })

  it('sans service monté : no-op strict', async () => {
    const list = [candidate('1')]
    expect(await new DiscoverMarketMemoryService().annotateObservedStacks(list)).toEqual(list)
  })
})

describe('DiscoverMarketMemoryService.sourceFactsFor — #4067.3 (de l’étiquette au FACTEUR)', () => {
  const okStacks = (stacks: Array<[string, string[] | null]>) => ({
    status: 'ok',
    stacks: new Map(stacks),
    technoFrequency: new Map(),
    corpusCompanies: 10,
  })

  it('rend le recours externe observé et la pile COMMUNE avec l’offre de l’ESN, par SIREN', async () => {
    const marketMemory = {
      observedStacksFor: jest.fn().mockResolvedValue(
        okStacks([
          ['1', ['java', 'kubernetes', 'sap']],
          ['2', null],
        ]),
      ),
      esnObservedManyFor: jest.fn().mockResolvedValue({
        status: 'ok',
        observed: new Map([
          ['1', true],
          ['2', null],
        ]),
      }),
    }
    const service = new DiscoverMarketMemoryService(marketMemory as unknown as MarketMemoryService)
    const facts = await service.sourceFactsFor(
      [candidate('1'), candidate('2')],
      ['Développement Java / Spring', 'Kubernetes'],
    )
    expect(facts?.get('1')).toEqual({ externalRecourse: true, stackOverlap: ['java', 'kubernetes'] })
    // Non couvert : « non observé », jamais « n'externalise pas ».
    expect(facts?.get('2')).toEqual({ externalRecourse: null, stackOverlap: null })
  })

  it('sans service, ou en panne, rend null — la source est NON MESURÉE, pas nulle', async () => {
    expect(await new DiscoverMarketMemoryService().sourceFactsFor([candidate('1')], [])).toBeNull()
    const broken = {
      observedStacksFor: jest.fn().mockResolvedValue({ status: 'unavailable', reason: 'read_failed' }),
      esnObservedManyFor: jest.fn().mockResolvedValue({ status: 'unavailable', reason: 'read_failed' }),
    }
    const service = new DiscoverMarketMemoryService(broken as unknown as MarketMemoryService)
    expect(await service.sourceFactsFor([candidate('1')], [])).toBeNull()
  })
})
