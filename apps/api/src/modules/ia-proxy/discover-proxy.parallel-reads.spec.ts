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
import type { DiscoverRegistryDto } from './dto/ia-proxy.dto'
import { ToolRegistryService } from '../tool-registry/tool-registry.service'

/**
 * #4045.12 — « /discover charge plus de 60 s » : avant ET après l'appel du moteur, l'API enchaînait des lectures
 * INDÉPENDANTES l'une après l'autre (profil puis SIREN de l'espace ; besoins connus puis référence comparable).
 * Chaque lecture compte dans le délai que l'écran attend : elles partent ensemble, et chacune ne part qu'UNE fois
 * par recherche (aucune lecture par candidat).
 */
const user = { userId: 'u-1' } as CurrentUserPayload

const candidate = (siren: string): DiscoverCandidate =>
  ({ name: `ACME ${siren}`, siren, portfolioState: 'new', accountId: null, signals: [], sources: [] }) as never

function gate() {
  let release: () => void = () => undefined
  const opened = new Promise<void>(resolve => {
    release = resolve
  })
  return { opened, release }
}

function build(response: DiscoverResponse) {
  const events: string[] = []
  const profileGate = gate()
  const sirensGate = gate()
  const needsGate = gate()
  const headlineGate = gate()
  const started = (name: string, g: ReturnType<typeof gate>, value: unknown) =>
    jest.fn(async () => {
      events.push(`start:${name}`)
      await g.opened
      events.push(`end:${name}`)
      return value
    })
  const n = response.candidates.length
  const esnProfile = { resolveProfileData: started('profile', profileGate, {}) }
  const portfolio = {
    resolve: jest.fn().mockResolvedValue(response.candidates.map(() => ({ portfolioState: 'new', accountId: null }))),
    resolveKnownNeeds: started('needs', needsGate, new Array(n).fill(2)),
    resolveKnownNeedFacts: jest.fn().mockResolvedValue(new Array(n).fill(undefined)),
    resolveSimilarityHeadlines: started('headline', headlineGate, new Array(n).fill('Référence comparable')),
  }
  const ia = { discoverRegistry: jest.fn().mockResolvedValue(response) }
  const controller = new IaProxyController(
    ia as unknown as IaClient,
    {} as unknown as ChatMessagesService,
    {
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }),
    } as unknown as WorkspaceContextService,
    esnProfile as unknown as EsnProfileReader,
    {} as unknown as ChatContextService,
    portfolio as unknown as DiscoverPortfolioService,
    { get: () => 0 } as unknown as ConfigService,
    { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
    {} as ChatThreadDocumentsService,
  )
  ;(controller as unknown as { lauraMode: unknown }).lauraMode = {
    resolveForUser: jest.fn().mockResolvedValue('my_activity'),
  }
  // #4792 — la lecture des SIREN résout le périmètre de BU (fail-closed) et lit aussi la base.
  ;(controller as unknown as { businessUnits: unknown }).businessUnits = {
    scopeFor: jest.fn().mockResolvedValue(null),
  }
  ;(controller as unknown as { discoverSources: unknown }).discoverSources = {
    spaceFactSirens: started('sirens', sirensGate, ['552081317']),
    baseAccountSirens: jest.fn().mockResolvedValue([]),
    collect: jest.fn().mockResolvedValue([]),
  }
  return { controller, events, ia, portfolio, esnProfile, gates: { profileGate, sirensGate, needsGate, headlineGate } }
}

const tick = () => new Promise<void>(resolve => setImmediate(resolve))

describe('#4045.12 — Découvrir : les lectures indépendantes partent ensemble', () => {
  const response: DiscoverResponse = {
    candidates: [candidate('111111111'), candidate('222222222')],
    query: {},
    degraded: [],
  }

  it('avant le moteur : le profil et les SIREN de l’espace sont lus en même temps', async () => {
    const { controller, events, gates } = build(response)
    const done = controller.discoverRegistry(user, { filters: {}, limit: 20 } as DiscoverRegistryDto)
    await tick()
    // Les deux lectures sont démarrées AVANT que la première ne rende.
    expect(events.slice(0, 2).sort()).toEqual(['start:profile', 'start:sirens'])
    for (const g of Object.values(gates)) g.release()
    await done
  })

  it('après le moteur : besoins connus et référence comparable sont lus en même temps, et fusionnés', async () => {
    const { controller, events, gates } = build(response)
    gates.profileGate.release()
    gates.sirensGate.release()
    const done = controller.discoverRegistry(user, { filters: {}, limit: 20 } as DiscoverRegistryDto)
    for (let i = 0; i < 20; i += 1) await tick()
    expect(events).toEqual(expect.arrayContaining(['start:needs', 'start:headline']))
    expect(events.indexOf('end:needs')).toBe(-1) // aucune des deux n'a fini : elles ne s'attendent pas
    gates.needsGate.release()
    gates.headlineGate.release()
    const result = await done
    expect(result.candidates.map(c => c.knownNeedsCount)).toEqual([2, 2])
    expect(result.candidates.map(c => c.similarityHeadline)).toEqual(['Référence comparable', 'Référence comparable'])
  })

  it('chaque lecture ne part qu’UNE fois par recherche, quel que soit le nombre de candidats', async () => {
    const { controller, portfolio, esnProfile, gates } = build({
      candidates: Array.from({ length: 24 }, (_, i) => candidate(String(100000000 + i))),
      query: {},
      degraded: [],
    })
    for (const g of Object.values(gates)) g.release()
    await controller.discoverRegistry(user, { filters: {}, limit: 24 } as DiscoverRegistryDto)
    expect(esnProfile.resolveProfileData).toHaveBeenCalledTimes(1)
    expect(portfolio.resolve).toHaveBeenCalledTimes(1)
    expect(portfolio.resolveKnownNeeds).toHaveBeenCalledTimes(1)
    expect(portfolio.resolveKnownNeedFacts).toHaveBeenCalledTimes(1)
    expect(portfolio.resolveSimilarityHeadlines).toHaveBeenCalledTimes(1)
  })
})
