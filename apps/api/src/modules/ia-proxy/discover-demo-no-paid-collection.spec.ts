import { BadRequestException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { IaClient } from '../ia/ia.client'
import type { ToolRegistryService } from '../tool-registry/tool-registry.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import type { DiscoverDto, DiscoverRegistryDto, DiscoverSignalsDto } from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/**
 * #4556 / #4628 — le REFUS : un utilisateur de la salle de démonstration ne déclenche JAMAIS une collecte payante.
 * « Explorer » (liste d'entreprises, liste par signal) rejoue une liste SCRIPTÉE ; la recherche libre
 * `POST /ia/discover` (un appel web + un appel au modèle) est refusée en salle. Le client IA est un piège :
 * tout appel, quel qu'il soit, fait rougir.
 */
describe('Découvrir en salle démo — aucune collecte payante (#4556, #4628)', () => {
  const user = { userId: 'u-demo' } as CurrentUserPayload

  function build(isDemo: boolean) {
    const calls: string[] = []
    const ia = new Proxy(
      {},
      {
        get: (_target, name) => () => {
          calls.push(String(name))
          throw new Error(`appel payant en démo : ${String(name)}`)
        },
      },
    ) as unknown as IaClient
    const profile = { resolveProfileData: jest.fn().mockResolvedValue({}) }
    const portfolio = {
      resolve: jest.fn().mockResolvedValue([]),
      resolveKnownNeeds: jest.fn().mockResolvedValue([]),
      resolveKnownNeedFacts: jest.fn().mockResolvedValue([]),
    }
    const controller = new IaProxyController(
      ia,
      {} as unknown as ChatMessagesService,
      { isDemoWorkspace: jest.fn().mockResolvedValue(isDemo) } as unknown as WorkspaceContextService,
      profile as unknown as EsnProfileReader,
      {} as unknown as ChatContextService,
      portfolio as unknown as DiscoverPortfolioService,
      { get: () => 0 } as unknown as ConfigService,
      { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
      {} as ChatThreadDocumentsService,
    )
    return { controller, calls }
  }

  it('la recherche libre est REFUSÉE en démo, sans aucun appel au client IA', async () => {
    const { controller, calls } = build(true)
    await expect(
      controller.discover(user, { criteria: 'cybersécurité' } as unknown as DiscoverDto),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(calls).toEqual([])
  })

  it('la liste par registre et la liste par signal répondent en démo sans aucun appel au client IA', async () => {
    const { controller, calls } = build(true)
    await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)
    await controller.discoverSignals(user, { filters: {} } as unknown as DiscoverSignalsDto)
    expect(calls).toEqual([])
  })

  it('sait dire NON : hors démo, la recherche libre atteint bien le client IA', async () => {
    const { controller, calls } = build(false)
    await expect(controller.discover(user, { criteria: 'cybersécurité' } as unknown as DiscoverDto)).rejects.toThrow(
      /appel payant en démo/,
    )
    expect(calls).toEqual(['discover'])
  })
})
