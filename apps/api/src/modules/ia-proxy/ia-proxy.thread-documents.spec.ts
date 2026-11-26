import type { ConfigService } from '@nestjs/config'
import type { Response } from 'express'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { ChatStreamEvent, IaClient } from '../ia/ia.client'
import type { ToolRegistryService } from '../tool-registry/tool-registry.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ChatContext, ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import type { ArchiveChatThreadDto, ChatDto, ChatThreadTargetDto } from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/**
 * #1954 — un document joint à Laura sert au FIL (décision de Louis, 12/09/2026).
 *
 * Deux gestes d'utilisateur, orchestrés ici :
 *  - le tour de chat transmet SON fil au service IA, qui ne lit un document
 *    « fil seul » que pour ce fil — et pas quand le fil est rangé ;
 *  - supprimer le fil supprime ses documents « fil seul », ou rien.
 */

const user = { userId: 'u-1' } as CurrentUserPayload

function fakeRes(): Response {
  return { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn() } as unknown as Response
}

function build(threadDocuments: Partial<Record<keyof ChatThreadDocumentsService, jest.Mock>>) {
  const order: string[] = []
  const ia = {
    chatStream: jest.fn().mockImplementation(async function* (): AsyncGenerator<ChatStreamEvent> {
      yield { type: 'done', success: true, data: { reply: 'ok' } }
    }),
  }
  const chatCtx: ChatContext = {
    accountData: null,
    contactsSummary: null,
    planSummary: null,
    accountsSummary: null,
    profileData: {},
    pinnedFacts: [],
    // #1916.24 — la liste des identifiants envoyés, vide comme `pinnedFacts`.
    pinnedFactIds: [],
    userPreferences: {},
    conversationSummary: null,
    crmConnected: false,
    crmProvider: null,
    crmPresence: null,
    accountFeedback: null,
    toolsSummary: null,
    firstName: null,
    // TÉMOIN — aucun fuseau sur ce profil : le service IA garde son fuseau de
    // RÉFÉRENCE (Europe/Paris), et le corps envoyé reste byte-identique.
    timezone: null,
  }
  const chatMessages = {
    listThread: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    listHistory: jest.fn().mockResolvedValue([]),
    setThreadArchived: jest.fn().mockResolvedValue(2),
    // #1911.15 — l'appelant ('u-1') EST l'auteur par défaut : cette suite
    // prouve l'ordre documents/messages, pas la permission (couverte par
    // `ia-proxy.controller.spec.ts`).
    threadAuthor: jest.fn().mockResolvedValue('u-1'),
    deleteThread: jest.fn(async () => {
      order.push('messages')
      return 3
    }),
  }
  const controller = new IaProxyController(
    ia as unknown as IaClient,
    chatMessages as unknown as ChatMessagesService,
    {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
      // #1942.2 / #1942.12 — un espace ORDINAIRE : le tour part. La salle de
      // démonstration, elle, refuse avant tout appel (`chat-demo-guard.spec.ts`).
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
    } as unknown as WorkspaceContextService,
    { resolveProfileData: jest.fn().mockResolvedValue({}) } as unknown as EsnProfileReader,
    {
      build: jest.fn().mockResolvedValue(chatCtx),
      recordConversationTurn: jest.fn().mockResolvedValue(undefined),
    } as unknown as ChatContextService,
    { resolve: jest.fn().mockResolvedValue([]) } as unknown as DiscoverPortfolioService,
    // Plafond désactivé : cette suite prouve le relais du fil, pas la borne.
    { get: () => 0 } as unknown as ConfigService,
    { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
    // #1954 — dépendance OBLIGATOIRE, juste après les huit du contrôleur : une
    // suppression de fil qui laisserait ses documents ne peut plus se construire.
    threadDocuments as unknown as ChatThreadDocumentsService,
  )
  return { ia, chatMessages, controller, order }
}

describe('le fil voyage jusqu’au service IA (#1954.7)', () => {
  it('un fil vivant transmet sa clé : Laura lit les documents joints à CE fil', async () => {
    const readableThread = jest.fn().mockResolvedValue('c-A')
    const { ia, controller } = build({ readableThread })

    await controller.chat(user, { message: 'Résume ce CV', conversationId: 'c-A' } as ChatDto, fakeRes())

    // #2703 — la clé du fil porte son propriétaire (sans effet sur une conversation nommée).
    expect(readableThread).toHaveBeenCalledWith({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'c-A',
    })
    const sent = ia.chatStream.mock.calls[0][0] as { conversationId?: string }
    expect(sent.conversationId).toBe('c-A')
  })

  it('un fil rangé ne transmet rien : ses documents « fil seul » sont masqués', async () => {
    const { ia, controller } = build({ readableThread: jest.fn().mockResolvedValue(undefined) })

    await controller.chat(user, { message: 'Résume ce CV', conversationId: 'c-A' } as ChatDto, fakeRes())

    const sent = ia.chatStream.mock.calls[0][0] as { conversationId?: string }
    expect(sent.conversationId).toBeUndefined()
  })
})

describe('supprimer un fil supprime SES documents « fil seul » (#1954)', () => {
  it('les documents partent AVANT les messages, bornés à cet espace et à ce fil', async () => {
    const deleteForThread = jest.fn()
    const { controller, order } = build({ deleteForThread })
    deleteForThread.mockImplementation(async () => {
      order.push('documents')
      return 1
    })

    await controller.deleteChatThread(user, { conversationId: 'c-A' } as ChatThreadTargetDto)

    expect(deleteForThread).toHaveBeenCalledWith({ workspaceId: 'ws-1', conversationId: 'c-A' })
    expect(order).toEqual(['documents', 'messages'])
  })

  it('NON : si ses documents ne peuvent pas être supprimés, le fil ne l’est pas non plus', async () => {
    const { controller, chatMessages } = build({
      deleteForThread: jest.fn().mockRejectedValue(new Error('db down')),
    })

    await expect(controller.deleteChatThread(user, { conversationId: 'c-A' } as ChatThreadTargetDto)).rejects.toThrow(
      'db down',
    )
    expect(chatMessages.deleteThread).not.toHaveBeenCalled()
  })

  it('ranger un fil ne supprime aucun document (on range, on ne supprime pas)', async () => {
    const deleteForThread = jest.fn()
    const { controller } = build({ deleteForThread })

    await controller.archiveChatThread(user, { conversationId: 'c-A', archived: true } as ArchiveChatThreadDto)

    expect(deleteForThread).not.toHaveBeenCalled()
  })
})
