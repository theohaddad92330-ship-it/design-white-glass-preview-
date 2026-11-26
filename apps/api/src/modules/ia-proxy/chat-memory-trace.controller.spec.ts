import type { ConfigService } from '@nestjs/config'
import type { Response } from 'express'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { ChatStreamEvent, IaClient } from '../ia/ia.client'
import type { MemoryReplyUsesService } from '../memory/memory-reply-uses.service'
import type { ToolRegistryService } from '../tool-registry/tool-registry.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ChatContext, ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import {
  createChatMessageSchema,
  type ChatDto,
  type CreateChatMessageDto,
  type ListChatMessagesDto,
} from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/**
 * #1916.18 / #1916.24 — le TOUR du chat : capturer les éléments de mémoire
 * envoyés, les rattacher à la réponse enregistrée, les compter à la relecture.
 *
 * ⚠️ La capture a lieu AVANT l'événement terminal : le web enregistre la
 * réponse dès qu'il le reçoit, et un rattachement arrivé avant l'écriture ne
 * trouverait rien — la trace serait perdue en silence.
 */

const user = { userId: 'u-1' } as CurrentUserPayload
const TURN = '11111111-1111-4111-8111-111111111111'

type Envelope = { success: boolean; data: Record<string, unknown> }

function fakeRes(order: string[]) {
  const writes: string[] = []
  const res = {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn((chunk: string) => {
      writes.push(chunk)
      order.push('write')
      return true
    }),
    end: jest.fn(),
  } as unknown as Response
  return { res, writes }
}

function terminalEvent(writes: string[]): { success: boolean; data: Record<string, unknown> } | null {
  const frame = writes.find(chunk => chunk.includes('"type":"done"'))
  return frame ? JSON.parse(frame.slice('data: '.length)) : null
}

function build(
  opts: {
    envelope?: Envelope
    streamThrows?: boolean
    pinnedFactIds?: string[]
    capture?: jest.Mock
    withTrace?: boolean
  } = {},
) {
  const order: string[] = []
  const envelope = opts.envelope ?? { success: true, data: { reply: 'Priorise EDF.' } }
  const ia = {
    chatStream: jest.fn().mockImplementation(async function* (): AsyncGenerator<ChatStreamEvent> {
      if (opts.streamThrows) throw new Error('idle timeout')
      yield { type: 'done', success: envelope.success, data: envelope.data }
    }),
  }
  const chatMessages = {
    // #1953.19 — un tour qui n'a rien rendu régularise sa demande (tranché Louis 16/09).
    releaseQuotaForUnrenderedTurn: jest.fn().mockResolvedValue(true),
    create: jest.fn().mockImplementation(async (args: { role: 'user' | 'assistant'; content: string }) => ({
      id: 'm-new',
      account_id: null,
      conversation_id: 'general',
      role: args.role,
      content: args.content,
      created_at: new Date('2026-09-13T09:00:00.000Z'),
    })),
    listThread: jest.fn().mockResolvedValue([
      {
        id: 'm-q',
        role: 'user',
        content: 'Q',
        account_id: null,
        conversation_id: 'general',
        created_at: new Date(),
        author: null,
      },
      {
        id: 'm-a',
        role: 'assistant',
        content: 'R',
        account_id: null,
        conversation_id: 'general',
        created_at: new Date(),
        author: null,
      },
    ]),
    markPrecisionRequest: jest.fn(),
  }
  const ctx: ChatContext = {
    accountData: null,
    contactsSummary: null,
    planSummary: null,
    accountsSummary: null,
    profileData: {},
    pinnedFacts: [{ fact: 'Budget voté', kind: 'fact', origin: 'manual' }],
    pinnedFactIds: opts.pinnedFactIds ?? ['f-1'],
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
  const chatContext = {
    build: jest.fn().mockResolvedValue(ctx),
    recordConversationTurn: jest.fn().mockResolvedValue(undefined),
  }
  const replyUses = {
    captureTurn:
      opts.capture ??
      jest.fn().mockImplementation(async () => {
        order.push('capture')
        return TURN
      }),
    attachTurn: jest.fn().mockResolvedValue(2),
    countsForMessages: jest.fn().mockResolvedValue(new Map([['m-a', 3]])),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }),
    extraPermissionsOf: jest.fn().mockResolvedValue([]),
    isDemoWorkspace: jest.fn().mockResolvedValue(false),
  }
  const controller = new IaProxyController(
    ia as unknown as IaClient,
    chatMessages as unknown as ChatMessagesService,
    workspaceContext as unknown as WorkspaceContextService,
    {} as unknown as EsnProfileReader,
    chatContext as unknown as ChatContextService,
    {} as unknown as DiscoverPortfolioService,
    { get: () => 0 } as unknown as ConfigService,
    { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
    // #1954 — dépendance OBLIGATOIRE depuis #1982, juste après les huit du
    // contrôleur. Intégration du 13/09 : cette suite, écrite avant, passait
    // `undefined` ici — le chat tombait sur `readableThread`, et la trace
    // atterrissait sur `brands` au lieu de `replyMemoryUses`.
    {
      readableThread: jest.fn(async ({ conversationId }: { conversationId: string | null }) => conversationId),
      deleteForThread: jest.fn().mockResolvedValue(undefined),
    } as unknown as ChatThreadDocumentsService,
    undefined, // providerCosts
    undefined, // marketMemory
    undefined, // accountsService
    undefined, // threadTitles
    undefined, // brands
    // Intégration du 13/09, lot A : quatre paramètres optionnels s'intercalent
    // ICI dans le constructeur fusionné — sans eux la trace atterrissait sur
    // les cartes de Laura au lieu de `replyMemoryUses`.
    undefined, // cards (#1943 L3)
    undefined, // consultants (#1951.2)
    undefined, // openNeeds (#1951.3)
    undefined, // planFeatures (#1957)
    opts.withTrace === false ? undefined : (replyUses as unknown as MemoryReplyUsesService),
  )
  return { controller, order, replyUses, chatMessages }
}

const chatDto = { message: 'hi', conversationId: 'general' } as ChatDto

describe('POST /ia/chat — capture des éléments de mémoire envoyés', () => {
  it('capture les identifiants envoyés pour une réponse réussie, AVANT l’événement terminal, qui porte le tour', async () => {
    const { controller, order, replyUses } = build({ pinnedFactIds: ['f-1', 'f-2'] })
    const { res, writes } = fakeRes(order)
    await controller.chat(user, chatDto, res)
    expect(replyUses.captureTurn).toHaveBeenCalledWith({
      userId: 'u-1',
      workspaceId: 'ws-1',
      surface: 'chat',
      factIds: ['f-1', 'f-2'],
    })
    expect(order).toEqual(['capture', 'write'])
    expect(terminalEvent(writes)?.data).toEqual({ reply: 'Priorise EDF.', memory_turn_id: TURN })
  })

  it('NON — un tour échoué ne capture rien et ne promet aucune trace', async () => {
    const { controller, order, replyUses } = build({ envelope: { success: false, data: { reply: 'Désolé.' } } })
    const { res, writes } = fakeRes(order)
    await controller.chat(user, chatDto, res)
    expect(replyUses.captureTurn).not.toHaveBeenCalled()
    expect(terminalEvent(writes)?.data).not.toHaveProperty('memory_turn_id')
  })

  it('NON — une réponse vide ne capture rien', async () => {
    const { controller, order, replyUses } = build({ envelope: { success: true, data: { reply: '' } } })
    await controller.chat(user, chatDto, fakeRes(order).res)
    expect(replyUses.captureTurn).not.toHaveBeenCalled()
  })

  it('NON — un flux interrompu en cours ne capture rien', async () => {
    const { controller, order, replyUses } = build({ streamThrows: true })
    const { res, writes } = fakeRes(order)
    await controller.chat(user, chatDto, res)
    expect(replyUses.captureTurn).not.toHaveBeenCalled()
    expect(terminalEvent(writes)?.success).toBe(false)
  })

  it('aucun élément envoyé : aucune capture, aucun tour', async () => {
    const { controller, order, replyUses } = build({ pinnedFactIds: [] })
    const { res, writes } = fakeRes(order)
    await controller.chat(user, chatDto, res)
    expect(replyUses.captureTurn).not.toHaveBeenCalled()
    expect(terminalEvent(writes)?.data).toEqual({ reply: 'Priorise EDF.' })
  })

  it('une capture ratée (tour `null`) laisse la réponse intacte, sans tour', async () => {
    const { controller, order } = build({ capture: jest.fn().mockResolvedValue(null) })
    const { res, writes } = fakeRes(order)
    await controller.chat(user, chatDto, res)
    expect(terminalEvent(writes)?.data).toEqual({ reply: 'Priorise EDF.' })
  })

  it('sans le service de trace, le chat répond comme avant', async () => {
    const { controller, order } = build({ withTrace: false })
    const { res, writes } = fakeRes(order)
    await controller.chat(user, chatDto, res)
    expect(terminalEvent(writes)?.data).toEqual({ reply: 'Priorise EDF.' })
  })
})

describe('POST /ia/chat/messages — rattacher le tour à la réponse enregistrée', () => {
  it('rattache le tour à la réponse de Laura qui vient d’être écrite, et dit combien d’éléments y sont liés', async () => {
    const { controller, replyUses } = build()
    const { message } = await controller.createChatMessage(user, {
      role: 'assistant',
      content: 'R',
      conversationId: 'general',
      memoryTurnId: TURN,
    } as CreateChatMessageDto)
    expect(replyUses.attachTurn).toHaveBeenCalledWith({
      turnId: TURN,
      messageId: 'm-new',
      userId: 'u-1',
      workspaceId: 'ws-1',
    })
    expect(message).toMatchObject({ id: 'm-new', memory_uses: 2 })
  })

  it('NON — un message de la personne ne rattache jamais un tour', async () => {
    const { controller, replyUses } = build()
    const { message } = await controller.createChatMessage(user, {
      role: 'user',
      content: 'Q',
      conversationId: 'general',
      memoryTurnId: TURN,
    } as CreateChatMessageDto)
    expect(replyUses.attachTurn).not.toHaveBeenCalled()
    expect(message).not.toHaveProperty('memory_uses')
  })

  it('un rattachement raté n’empêche pas l’écriture du fil — et n’annonce aucun compte', async () => {
    const { controller, replyUses } = build()
    replyUses.attachTurn.mockRejectedValueOnce(new Error('db down'))
    const { message } = await controller.createChatMessage(user, {
      role: 'assistant',
      content: 'R',
      conversationId: 'general',
      memoryTurnId: TURN,
    } as CreateChatMessageDto)
    expect(message).toMatchObject({ id: 'm-new' })
    expect(message).not.toHaveProperty('memory_uses')
  })

  it('le DTO refuse un tour qui n’est pas un identifiant émis par le serveur', () => {
    expect(
      createChatMessageSchema.safeParse({ role: 'assistant', content: 'R', memoryTurnId: 'pas-un-uuid' }).success,
    ).toBe(false)
    expect(createChatMessageSchema.safeParse({ role: 'assistant', content: 'R', memoryTurnId: TURN }).success).toBe(
      true,
    )
  })
})

describe('GET /ia/chat/messages — le compte par réponse, en une lecture', () => {
  it('porte `memory_uses` sur les réponses de Laura seulement, en UNE requête', async () => {
    const { controller, replyUses } = build()
    const { messages } = await controller.listChatMessages(user, {
      conversationId: 'general',
      limit: 50,
    } as ListChatMessagesDto)
    expect(replyUses.countsForMessages).toHaveBeenCalledTimes(1)
    expect(replyUses.countsForMessages).toHaveBeenCalledWith({ workspaceId: 'ws-1', messageIds: ['m-a'] })
    expect(messages.find(message => message.id === 'm-a')).toMatchObject({ memory_uses: 3 })
    expect(messages.find(message => message.id === 'm-q')).not.toHaveProperty('memory_uses')
  })

  it('un compte illisible n’est pas zéro : le champ est ABSENT', async () => {
    const { controller, replyUses } = build()
    replyUses.countsForMessages.mockRejectedValueOnce(new Error('db down'))
    const { messages } = await controller.listChatMessages(user, {
      conversationId: 'general',
      limit: 50,
    } as ListChatMessagesDto)
    for (const message of messages) expect(message).not.toHaveProperty('memory_uses')
  })
})
