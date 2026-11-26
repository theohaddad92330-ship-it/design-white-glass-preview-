import type { ConfigService } from '@nestjs/config'
import type { DiscoverCandidate, DiscoverResponse } from '@bellum/contracts'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { IaClient } from '../ia/ia.client'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import { IaProxyController } from './ia-proxy.controller'
import type { DiscoverRegistryDto, DiscoverSignalsDto } from './dto/ia-proxy.dto'
import type { ToolRegistryService } from '../tool-registry/tool-registry.service'

/**
 * #4067 — les deux routes Découvrir posent `sourceAxes` sur chaque candidat :
 * ce que l'ESPACE ACTIF sait déjà (historique, CRM, mémoire marché,
 * référentiel, Drive, missions). Best-effort : sans le service, ou en panne,
 * la réponse sort à l'identique — jamais une panne de Découvrir pour un axe.
 */
describe('IaProxyController — axes de sources Découvrir (#4067)', () => {
  const user = { userId: 'u-1' } as CurrentUserPayload
  const PROFILE = { offers: ['Développement Java'], placedRoles: ['Data engineer'] }

  const candidate = (siren: string, overrides: Partial<DiscoverCandidate> = {}): DiscoverCandidate =>
    ({
      name: `ACME ${siren}`,
      siren,
      nafCode: '62.02A',
      sector: null,
      city: null,
      department: null,
      headcountRange: null,
      creationDate: null,
      score: 40,
      scoreMax: 100,
      scoreFactors: [],
      signals: [],
      angle: null,
      suggestedRoles: [],
      portfolioState: 'new',
      accountId: null,
      sources: [],
      ...overrides,
    }) as DiscoverCandidate

  const NO_FACTS = { signalHistory: null, crm: null, dataforge: null, drive: null, missions: null }

  function build(response: DiscoverResponse, sources?: { collect: jest.Mock }) {
    const ia = {
      discoverRegistry: jest.fn().mockResolvedValue(response),
      discoverSignals: jest.fn().mockResolvedValue(response),
    }
    const portfolio = {
      resolve: jest
        .fn()
        .mockImplementation(async (_: string, candidates: DiscoverCandidate[]) =>
          candidates.map(c => ({ portfolioState: c.accountId ? 'analyzed' : 'new', accountId: c.accountId })),
        ),
      resolveSimilarityHeadlines: jest
        .fn()
        .mockImplementation(async (_: string, c: unknown[]) => c.map(() => undefined)),
      resolveKnownNeeds: jest.fn().mockImplementation(async (c: unknown[]) => c.map(() => undefined)),
      resolveKnownNeedFacts: jest.fn().mockImplementation(async (c: unknown[]) => c.map(() => undefined)),
    }
    const workspace = {
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }),
    }
    const controller = new IaProxyController(
      ia as unknown as IaClient,
      {} as unknown as ChatMessagesService,
      workspace as unknown as WorkspaceContextService,
      { resolveProfileData: jest.fn().mockResolvedValue(PROFILE) } as unknown as EsnProfileReader,
      {} as unknown as ChatContextService,
      portfolio as unknown as DiscoverPortfolioService,
      { get: () => 0 } as unknown as ConfigService,
      { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
      {} as ChatThreadDocumentsService,
    )
    const discoverMarketMemory = {
      applyFilters: jest.fn().mockImplementation(async (candidates: unknown[]) => ({ candidates, degraded: [] })),
      annotateObservedStacks: jest.fn().mockImplementation(async (candidates: unknown[]) => candidates),
      sourceFactsFor: jest
        .fn()
        .mockResolvedValue(new Map([['111111111', { externalRecourse: true, stackOverlap: ['java'] }]])),
    }
    const internals = controller as unknown as Record<string, unknown>
    internals.discoverMarketMemory = discoverMarketMemory
    internals.lauraMode = { resolveForUser: jest.fn().mockResolvedValue('my_activity') }
    if (sources) internals.discoverSources = sources
    return { controller, discoverMarketMemory, workspace }
  }

  it('registre : chaque candidat porte ses axes, calculés sur les faits de l’ESPACE ACTIF', async () => {
    const collect = jest
      .fn()
      .mockResolvedValue([
        { ...NO_FACTS, crm: { won: 1, lost: 0, open: 0, dormant: 0, contacts: 2, lastActivityAt: null } },
        NO_FACTS,
      ])
    const response: DiscoverResponse = {
      candidates: [candidate('111111111', { accountId: 'acc-1' }), candidate('222222222')],
      query: {},
      degraded: [],
    }
    const { controller, discoverMarketMemory } = build(response, { collect })
    const result = await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)

    expect(collect).toHaveBeenCalledWith('ws-1', [
      { siren: '111111111', name: 'ACME 111111111', accountId: 'acc-1' },
      { siren: '222222222', name: 'ACME 222222222', accountId: null },
    ])
    // L'offre de l'ESN (profil résolu server-side) sert à la pile commune.
    expect(discoverMarketMemory.sourceFactsFor).toHaveBeenCalledWith(
      expect.any(Array),
      expect.arrayContaining(['Développement Java', 'Data engineer']),
    )
    const [owned, fresh] = result.candidates
    expect(owned.sourceAxes?.axes.find(axis => axis.key === 'crm')?.points).toBe(12)
    expect(owned.sourceAxes?.axes.find(axis => axis.key === 'market_memory')?.points).toBe(8)
    // Rien de mesuré pour le second : axes tous nommés non mesurés, jamais des zéros.
    expect(fresh.sourceAxes?.score).toBeNull()
    expect(fresh.sourceAxes?.unmeasured).toHaveLength(6)
  })

  it('signaux : même enrichissement', async () => {
    const collect = jest.fn().mockResolvedValue([NO_FACTS])
    const response: DiscoverResponse = { candidates: [candidate('111111111')], query: {}, degraded: [] }
    const { controller } = build(response, { collect })
    const result = await controller.discoverSignals(user, {} as DiscoverSignalsDto)
    expect(result.candidates[0].sourceAxes?.axes.find(axis => axis.key === 'market_memory')?.measured).toBe(true)
  })

  it('sans le service, ou s’il jette, la réponse sort à l’identique (aucun axe inventé)', async () => {
    const response: DiscoverResponse = { candidates: [candidate('333333333')], query: {}, degraded: [] }
    const without = await build(response).controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)
    expect(without.candidates[0].sourceAxes).toBeUndefined()

    const broken = { collect: jest.fn().mockRejectedValue(new Error('db down')) }
    const failed = await build(response, broken).controller.discoverRegistry(user, {
      filters: {},
    } as DiscoverRegistryDto)
    expect(failed.candidates[0].sourceAxes).toBeUndefined()
  })

  // #4067.11 (#4286.15.d) — ce que la base commune sait de la société pèse dans « observé sur le marché »,
  // y compris quand la mémoire marché n'a rien observé ; le nombre ne s'invente pas ailleurs.
  it('#4067.11 — les personnes connues de la base commune entrent dans l’axe « observé sur le marché »', async () => {
    const collect = jest
      .fn()
      .mockResolvedValue([{ ...NO_FACTS, sharedPeople: 2 }, { ...NO_FACTS, sharedPeople: 5 }, NO_FACTS])
    const response: DiscoverResponse = {
      candidates: [candidate('111111111'), candidate('222222222'), candidate('333333333')],
      query: {},
      degraded: [],
    }
    const result = await build(response, { collect }).controller.discoverRegistry(user, {
      filters: {},
    } as DiscoverRegistryDto)
    const market = (index: number) => result.candidates[index]?.sourceAxes?.axes.find(a => a.key === 'market_memory')
    // Recours + pile (8) + base commune (2), au plafond.
    expect(market(0)?.points).toBe(10)
    // Rien d'observé par la mémoire marché, mais 5 personnes connues : l'axe est mesuré, le nombre nommé.
    expect(market(1)?.measured).toBe(true)
    expect(market(1)?.label_key).toBe('market_shared_people')
    expect(market(1)?.label_params).toEqual(expect.objectContaining({ n: 5 }))
    // Aucune personne connue, rien d'observé : non mesuré, jamais un zéro.
    expect(market(2)?.measured).toBe(false)
  })
})
