import type { Response } from 'express'
import type { ConfigService } from '@nestjs/config'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { CopilotCardService } from '../action-os/copilot-card.service'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { IaClient } from '../ia/ia.client'
import type { ToolRegistryService } from '../tool-registry/tool-registry.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { ChatThreadExportService } from './chat-thread-export.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import type { ChatThreadTargetDto } from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/**
 * #1955.7 / #1955.22 / #1955.23 — L'ORCHESTRATION de l'export d'un fil.
 *
 * GA-07 a renvoyé au contrôleur les deux lectures que `ChatThreadExportService`
 * allait chercher dans d'autres modules (Action OS, registre d'outils). Ce
 * déplacement ne doit RIEN perdre : les deux garanties que la suite du service
 * portait avant vivent ici, au seul endroit qui les décide encore.
 *
 *  - les cartes confirmées sont lues au nom de L'APPELANT et pour LE fil demandé
 *    (#1955.22 : jamais l'espace entier) ;
 *  - le registre d'outils est lu pour L'APPELANT (#1955.23).
 *
 * Et le témoin inverse : sans Action OS, l'export répond 503 plutôt qu'un
 * fichier dont la section « actions » serait vide sans le dire.
 */

const user = { userId: 'u-1', email: 'rep@esn.fr' } as CurrentUserPayload

const EXPORT: Awaited<ReturnType<ChatThreadExportService['build']>> = {
  title: 'Fil du 2026-09-15',
  generatedAt: '2026-09-15T08:05:00.000Z',
  scope: { accountId: null, accountName: null },
  authors: [],
  messages: [],
  sources: [],
  actions: [],
  limits: [],
}

function fakeRes(): Response {
  return { setHeader: jest.fn(), send: jest.fn(), end: jest.fn(), status: jest.fn() } as unknown as Response
}

function build(options: { withCards?: boolean; timezone?: string | null } = {}) {
  const toolRegistry = { list: jest.fn().mockResolvedValue([]) }
  const cards = { confirmedForThread: jest.fn().mockResolvedValue([]) }
  const threadExport = { build: jest.fn().mockResolvedValue(EXPORT) }
  // #1955.18 — la même dérivation que le tour de chat pour le fuseau de la
  // date affichée dans l'export ; `undefined` par défaut ⇒ fuseau de
  // référence nommé du produit (Europe/Paris), pas une devinette.
  const chatContext = { resolveTimezone: jest.fn().mockResolvedValue(options.timezone ?? 'Europe/Paris') }
  const controller = new IaProxyController(
    {} as unknown as IaClient,
    {} as unknown as ChatMessagesService,
    {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    } as unknown as WorkspaceContextService,
    {} as unknown as EsnProfileReader,
    chatContext as unknown as ChatContextService,
    {} as unknown as DiscoverPortfolioService,
    { get: () => 0 } as unknown as ConfigService,
    toolRegistry as unknown as ToolRegistryService,
    {} as unknown as ChatThreadDocumentsService,
    undefined, // providerCosts
    undefined, // marketMemory
    undefined, // accountsService
    undefined, // threadTitles
    undefined, // brands
    options.withCards === false ? undefined : (cards as unknown as CopilotCardService),
    undefined, // consultants
    undefined, // openNeeds
    undefined, // planFeatures
    undefined, // replyMemoryUses
    undefined, // replyFeedback
    undefined, // unroutedIntents
    undefined, // storage
    undefined, // missions
    threadExport as unknown as ChatThreadExportService,
  )
  return { controller, toolRegistry, cards, threadExport, chatContext }
}

describe('l’export d’un fil s’orchestre au contrôleur (GA-07)', () => {
  it('lit les cartes confirmées au nom de l’appelant, pour CE fil — jamais l’espace entier', async () => {
    const { controller, cards, toolRegistry, threadExport } = build()

    await controller.exportChatThreadJson(user, { conversationId: 'c-1' } as ChatThreadTargetDto, fakeRes())

    expect(cards.confirmedForThread).toHaveBeenCalledWith({ userId: 'u-1', email: 'rep@esn.fr', origin: 'user' }, 'c-1')
    expect(toolRegistry.list).toHaveBeenCalledWith('u-1')
    const passed = threadExport.build.mock.calls[0]?.[0] as { conversationId: string | null; workspaceId: string }
    expect(passed.conversationId).toBe('c-1')
    expect(passed.workspaceId).toBe('ws-1')
  })

  it('SAIT DIRE NON — sans Action OS, l’export refuse plutôt que d’omettre ses actions', async () => {
    const { controller, threadExport } = build({ withCards: false })

    await expect(
      controller.exportChatThreadJson(user, { conversationId: 'c-1' } as ChatThreadTargetDto, fakeRes()),
    ).rejects.toThrow('L’export des conversations est indisponible.')
    expect(threadExport.build).not.toHaveBeenCalled()
  })
})

/**
 * #1955.18 — la date d'un export `.md`/`.pdf` se lit, au fuseau de
 * l'utilisateur, dans la langue déclarée par le navigateur. Le `.json` garde
 * ses dates en ISO (format machine) : il n'est pas concerné par ce fuseau.
 */
describe('exportChatThreadMarkdown/Pdf — la date affichée (#1955.18)', () => {
  function markdownOf(response: Response): string {
    const buffer = (response.end as jest.Mock).mock.calls[0]?.[0] as Buffer
    return buffer.toString('utf8')
  }

  it('résout le fuseau depuis le PROFIL — même dérivation que le tour de chat', async () => {
    const { controller, chatContext } = build({ timezone: 'Europe/Paris' })
    await controller.exportChatThreadMarkdown(user, { conversationId: 'c-1' } as ChatThreadTargetDto, fakeRes())
    expect(chatContext.resolveTimezone).toHaveBeenCalledWith('u-1')
  })

  it('sans langue déclarée, la date reste en FRANÇAIS lisible — jamais l’ISO brut', async () => {
    const { controller } = build()
    const response = fakeRes()
    await controller.exportChatThreadMarkdown(user, { conversationId: 'c-1' } as ChatThreadTargetDto, response)
    const markdown = markdownOf(response)
    expect(markdown).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(markdown).toContain('septembre')
  })

  it('interfaceLanguage=en rend la date en ANGLAIS lisible — parité stricte avec le français', async () => {
    const { controller } = build()
    const response = fakeRes()
    await controller.exportChatThreadMarkdown(
      user,
      { conversationId: 'c-1', interfaceLanguage: 'en' } as ChatThreadTargetDto,
      response,
    )
    const markdown = markdownOf(response)
    expect(markdown).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(markdown).toContain('September')
  })

  it('sait dire NON : une valeur inconnue d’interfaceLanguage retombe sur le français, jamais un troisième canal deviné', async () => {
    const { controller } = build()
    const response = fakeRes()
    await controller.exportChatThreadMarkdown(
      user,
      { conversationId: 'c-1', interfaceLanguage: 'de' } as ChatThreadTargetDto,
      response,
    )
    expect(markdownOf(response)).toContain('septembre')
  })
})
