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
import type { GenerateMessageDto } from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/**
 * #4592.4 — LA SALLE DE DÉMONSTRATION NE REDIGE RIEN PAR `POST /ia/message`.
 *
 * Le bouton « Générer le mail » est masqué côté navigateur (`PlanMailBlock`), mais un client se contourne :
 * sans cette garde SERVEUR, un appel direct partait au moteur de rédaction, facturé, sur un espace que
 * personne ne surveille (même promesse que `POST /ia/chat`, `chat-demo-guard.spec.ts`).
 *
 * Ce que cette suite sait dire :
 *  · NON — en démonstration, aucun appel au moteur, aucun profil lu, et un refus qui porte un `code` ;
 *  · et pas plus — hors démonstration, l'appel part exactement comme avant.
 */

const USER = { userId: '9d359267-0000-4000-8000-000000000001', email: 'rep@esn.fr' } as CurrentUserPayload
const DTO = { contactId: 'c-1', channel: 'email', context: 'Relance' } as GenerateMessageDto

function build(options: { demo: boolean }) {
  const ia = { generateMessage: jest.fn().mockResolvedValue({ success: true, data: { body: 'Bonjour' } }) }
  const esnProfile = { resolveProfileData: jest.fn().mockResolvedValue({}) }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    isDemoWorkspace: jest.fn().mockResolvedValue(options.demo),
  }
  const controller = new IaProxyController(
    ia as unknown as IaClient,
    {} as ChatMessagesService,
    workspaceContext as unknown as WorkspaceContextService,
    esnProfile as unknown as EsnProfileReader,
    {} as ChatContextService,
    {} as DiscoverPortfolioService,
    { get: () => 0 } as unknown as ConfigService,
    { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
    {} as ChatThreadDocumentsService,
  )
  return { controller, ia, esnProfile }
}

describe('POST /ia/message — la salle de démonstration', () => {
  it('REFUSE sans appeler le moteur de rédaction, avec un code lisible', async () => {
    const { controller, ia, esnProfile } = build({ demo: true })

    const error = await controller.generateMessage(USER, DTO).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(BadRequestException)
    expect(ia.generateMessage).not.toHaveBeenCalled()
    expect(esnProfile.resolveProfileData).not.toHaveBeenCalled()
    const body = (error as BadRequestException).getResponse() as { code?: string; message?: string }
    expect(body.code).toBe('message_demo_unavailable')
    expect(body.message).toContain('démonstration')
  })

  it('hors démonstration, rien ne change : l’appel part et le corps revient', async () => {
    const { controller, ia } = build({ demo: false })

    const out = await controller.generateMessage(USER, DTO)

    expect(ia.generateMessage).toHaveBeenCalledTimes(1)
    expect(out).toEqual({ success: true, data: { body: 'Bonjour' } })
  })
})
