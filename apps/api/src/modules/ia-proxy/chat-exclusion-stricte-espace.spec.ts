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
import { chatSchema, type ChatDto } from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/**
 * #3772.5 — L'EXCLUSION STRICTE voyage du navigateur jusqu'au service IA, et
 * jusqu'au contexte lu : un champ du DTO jamais relayé serait « du code juste que
 * personne n'appelle ». Sans le champ, le corps est celui d'AVANT.
 */

const user = { userId: 'u-1' } as CurrentUserPayload

/** `/ia/chat` diffuse en SSE (LOT STREAM, 12/09/2026) — `fakeRes()` tient
 *  lieu de `@Res()`, et `ia.chatStream` remplace `ia.chat`. */
function fakeRes(): Response {
  return { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn() } as unknown as Response
}

function build() {
  const ia = {
    chatStream: jest.fn().mockImplementation(async function* (): AsyncGenerator<ChatStreamEvent> {
      yield { type: 'done', success: true, data: { reply: 'ok' } }
    }),
  } as unknown as jest.Mocked<Pick<IaClient, 'chatStream'>>
  const chatCtx: ChatContext = {
    accountData: null,
    contactsSummary: null,
    planSummary: null,
    accountsSummary: null,
    profileData: {},
    pinnedFacts: [],
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
  const chatContext = {
    build: jest.fn().mockResolvedValue(chatCtx),
    recordConversationTurn: jest.fn().mockResolvedValue(undefined),
  }
  const controller = new IaProxyController(
    ia as unknown as IaClient,
    {
      listThread: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      listHistory: jest.fn().mockResolvedValue([]),
    } as unknown as ChatMessagesService,
    {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
      // #1942.2 / #1942.12 — un espace ORDINAIRE : le tour part. La salle de
      // démonstration, elle, refuse avant tout appel (`chat-demo-guard.spec.ts`).
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
    } as unknown as WorkspaceContextService,
    { resolveProfileData: jest.fn().mockResolvedValue({}) } as unknown as EsnProfileReader,
    chatContext as unknown as ChatContextService,
    { resolve: jest.fn().mockResolvedValue([]) } as unknown as DiscoverPortfolioService,
    // Plafond désactivé : cette suite prouve le relais du contexte, pas la borne.
    { get: () => 0 } as unknown as ConfigService,
    { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
    // #1954 — obligatoire ; cette suite prouve le contexte de page, pas le fil.
    { readableThread: jest.fn().mockResolvedValue(undefined) } as unknown as ChatThreadDocumentsService,
  )
  return { ia, controller, chatContext }
}

describe('#3772.5 — l’exclusion stricte des données de l’espace', () => {
  it('atteint le contexte lu ET le service IA, et le dossier demandé est écarté', async () => {
    const { ia, controller, chatContext } = build()
    await controller.chat(
      user,
      { message: 'Quels comptes ?', accountId: 'a-1', excludeWorkspaceData: true } as ChatDto,
      fakeRes(),
    )
    const built = (chatContext.build as jest.Mock).mock.calls[0][0] as {
      accountId?: string
      excludeWorkspaceData?: boolean
      marketPortfolio?: unknown
    }
    expect(built.excludeWorkspaceData).toBe(true)
    expect(built.accountId).toBeUndefined()
    expect(built.marketPortfolio).toBeNull()
    const sent = (ia.chatStream as jest.Mock).mock.calls[0][0] as { excludeWorkspaceData?: boolean; accountId?: string }
    expect(sent.excludeWorkspaceData).toBe(true)
    expect(sent.accountId).toBeUndefined()
  })

  it('TÉMOIN — sans le champ, le dossier reste lu et rien n’est transmis', async () => {
    const { ia, controller, chatContext } = build()
    await controller.chat(user, { message: 'Bonjour', accountId: 'a-1' } as ChatDto, fakeRes())
    const built = (chatContext.build as jest.Mock).mock.calls[0][0] as {
      accountId?: string
      excludeWorkspaceData?: boolean
    }
    expect(built.accountId).toBe('a-1')
    expect(built.excludeWorkspaceData).toBe(false)
    const sent = (ia.chatStream as jest.Mock).mock.calls[0][0] as { excludeWorkspaceData?: boolean }
    expect(sent.excludeWorkspaceData).toBeUndefined()
  })

  it('un champ non booléen est refusé à l’entrée, et le champ reste facultatif', () => {
    expect(chatSchema.safeParse({ message: 'x', excludeWorkspaceData: 'oui' }).success).toBe(false)
    expect(chatSchema.safeParse({ message: 'x', excludeWorkspaceData: true }).success).toBe(true)
    expect(chatSchema.safeParse({ message: 'x' }).success).toBe(true)
  })
})
