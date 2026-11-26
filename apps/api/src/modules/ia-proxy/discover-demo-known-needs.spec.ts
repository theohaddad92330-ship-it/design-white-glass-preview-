import type { ConfigService } from '@nestjs/config'
import type { DiscoverResponse } from '@bellum/contracts'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { DEMO_DELIVERY_CARRIER } from '../demo/demo-dataset'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { IaClient } from '../ia/ia.client'
import type { ToolRegistryService } from '../tool-registry/tool-registry.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import type { DiscoverRegistryDto } from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/**
 * #3819.1 (lot RBB2, 11/10) — en salle démo, la carte du compte que l'équipe
 * possède déjà dit « N besoins connus » : la liste de Découvrir reste scriptée,
 * mais l'appartenance et le décompte passent par le VRAI service portefeuille
 * (jamais un nombre tapé à la main), et seulement pour le compte client semé.
 */
describe('Découvrir en salle démo — besoins connus (#3819.1)', () => {
  const user = { userId: 'u-1' } as CurrentUserPayload

  function build() {
    const portfolio = {
      resolve: jest
        .fn()
        .mockImplementation(async (_userId: string, candidates: { name: string }[]) =>
          candidates.map(c => ({ portfolioState: 'customer', accountId: `acc-${c.name}` })),
        ),
      resolveKnownNeeds: jest
        .fn()
        .mockImplementation(async (candidates: { accountId: string | null }[]) => candidates.map(() => 3)),
      resolveKnownNeedFacts: jest
        .fn()
        .mockImplementation(async (candidates: { accountId: string | null }[]) =>
          candidates.map(() => [{ label: 'Supervision des flux de paiement', date: '2026-09-20' }]),
        ),
    }
    const controller = new IaProxyController(
      {} as unknown as IaClient,
      {} as unknown as ChatMessagesService,
      { isDemoWorkspace: jest.fn().mockResolvedValue(true) } as unknown as WorkspaceContextService,
      {} as unknown as EsnProfileReader,
      {} as unknown as ChatContextService,
      portfolio as unknown as DiscoverPortfolioService,
      { get: () => 0 } as unknown as ConfigService,
      { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
      {} as ChatThreadDocumentsService,
    )
    return { portfolio, controller }
  }

  it('le compte client semé porte son accountId et son décompte de besoins, les autres cartes restent scriptées', async () => {
    const { portfolio, controller } = build()
    const result = (await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)) as DiscoverResponse
    const owned = result.candidates.find(c => c.name === DEMO_DELIVERY_CARRIER)
    expect(owned).toMatchObject({ accountId: `acc-${DEMO_DELIVERY_CARRIER}`, knownNeedsCount: 3 })
    // #4068 — les besoins eux-mêmes, par le MÊME vrai chemin (la carte en montre au moins un).
    expect(owned?.knownNeeds).toEqual([{ label: 'Supervision des flux de paiement', date: '2026-09-20' }])
    const others = result.candidates.filter(c => c.name !== DEMO_DELIVERY_CARRIER)
    expect(others.length).toBeGreaterThan(0)
    expect(
      others.every(c => c.accountId === null && c.knownNeedsCount === undefined && c.knownNeeds === undefined),
    ).toBe(true)
    // un seul appel groupé, sur la seule carte possédée
    expect(portfolio.resolve).toHaveBeenCalledTimes(1)
    expect(portfolio.resolve.mock.calls[0][1].map((c: { name: string }) => c.name)).toEqual([DEMO_DELIVERY_CARRIER])
  })

  it('#4067 — le compte semé passe par le VRAI calcul des axes de sources ; les cartes scriptées gardent les leurs', async () => {
    const { controller } = build()
    const collect = jest.fn().mockResolvedValue([
      {
        signalHistory: null,
        crm: { won: 1, lost: 0, open: 0, dormant: 0, contacts: 3, lastActivityAt: null },
        dataforge: null,
        drive: null,
        missions: { missions: 2, consultants: 0, latestAt: '2026-06-30' },
      },
    ])
    const internals = controller as unknown as Record<string, unknown>
    internals.discoverSources = { collect }
    ;(internals.workspaceContext as Record<string, unknown>).resolveActiveWorkspace = jest
      .fn()
      .mockResolvedValue({ workspaceId: 'ws-demo' })
    internals.esnProfile = { resolveProfileData: jest.fn().mockResolvedValue({}) }
    const result = (await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)) as DiscoverResponse
    const owned = result.candidates.find(c => c.name === DEMO_DELIVERY_CARRIER)
    expect(collect).toHaveBeenCalledWith('ws-demo', [
      { siren: owned?.siren, name: DEMO_DELIVERY_CARRIER, accountId: `acc-${DEMO_DELIVERY_CARRIER}` },
    ])
    expect(owned?.sourceAxes?.axes.find(axis => axis.key === 'crm')?.points).toBe(13)
    expect(owned?.sourceAxes?.axes.find(axis => axis.key === 'missions')?.points).toBe(6)
  })
})
