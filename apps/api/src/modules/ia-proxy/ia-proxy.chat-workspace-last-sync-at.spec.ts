/**
 * # LA DERNIÈRE COLLECTE CONNUE DE L'ESPACE VOYAGE-T-ELLE JUSQU'AU SERVICE IA ?
 *
 * #2266.10 (épopée #2920) — aucun signal de fraîcheur n'atteignait jamais le
 * service IA à l'échelle du WORKSPACE (seul `collected_at` existe PAR
 * SEGMENT PAR COMPTE), donc Laura ne pouvait jamais dater la dernière
 * collecte réussie de l'espace ni s'empêcher de sous-entendre une fraîcheur
 * qu'aucun compte n'a jamais eue.
 *
 * Même patron, même preuve en trois parties que `ia-proxy.chat-workspace-created-at.spec.ts` :
 *
 *   `ChatContext.workspaceLastSyncAt` → `IaProxyController.chat` réel →
 *   `IaClient.chatStream` réel → corps POSTé sur `/chat/message`.
 *
 *  · elle sait dire NON — retirer `workspaceLastSyncAt: ctx.workspaceLastSyncAt
 *    ?? undefined` du contrôleur, ou le `...(input.workspaceLastSyncAt ? …)`
 *    de `chatBody`, la fait rougir ;
 *  · elle LIT quelque chose — le corps réellement sérialisé sur le fil ;
 *  · elle n'attrape pas le cas voisin — le TÉMOIN : un espace SANS collecte
 *    connue n'envoie AUCUNE clé.
 */
const mockFetch = jest.fn()
jest.mock('undici', () => ({ Agent: jest.fn(), fetch: (...args: unknown[]) => mockFetch(...args) }))

import type { ArgumentMetadata } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { Response } from 'express'
import { ZodValidationPipe } from 'nestjs-zod'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { CorrelationIdService } from '../../correlation-id/correlation-id.service'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { IaClient } from '../ia/ia.client'
import type { ToolRegistryService } from '../tool-registry/tool-registry.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ChatContext, ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import { ChatDto } from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/** Un flux SSE à un seul événement terminal, lu par le VRAI `streamSse`. */
function sseDone(): Response {
  const bytes = new TextEncoder().encode(
    `data: ${JSON.stringify({ type: 'done', success: true, data: { reply: 'C’est noté.' } })}\n\n`,
  )
  let sent = false
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined }
          sent = true
          return { done: false, value: bytes }
        },
        cancel: async () => undefined,
        releaseLock: () => undefined,
      }),
    },
  } as unknown as Response
}

function fakeRes(): Response {
  return { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn() } as unknown as Response
}

function webBody(): Record<string, unknown> {
  return {
    message: 'Quand a-t-on collecté des données pour la dernière fois ?',
    accountId: null,
    conversationId: 'c0ffee00-0000-4000-8000-000000000017',
    history: [],
    documentIds: [],
    clarificationAsked: false,
  }
}

function chatContext(workspaceLastSyncAt: string | null): ChatContext {
  return {
    accountData: {},
    contactsSummary: '',
    planSummary: '',
    accountsSummary: 'THALES — Industrie — 8/10',
    profileData: { companyName: 'MonESN' },
    pinnedFacts: [],
    pinnedFactIds: [],
    userPreferences: {},
    conversationSummary: '',
    crmConnected: false,
    crmProvider: null,
    crmPresence: null,
    accountFeedback: '',
    toolsSummary: '',
    firstName: 'Louis',
    timezone: null,
    workspaceTimezone: null,
    workspaceCreatedAt: null,
    workspaceLastSyncAt,
  }
}

function buildRealChain(ctx: ChatContext): IaProxyController {
  const ia = new IaClient({ get: () => 'http://ia.test' } as unknown as ConfigService, new CorrelationIdService())
  return new IaProxyController(
    ia,
    { markPrecisionRequest: jest.fn() } as unknown as ChatMessagesService,
    {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
    } as unknown as WorkspaceContextService,
    {} as unknown as EsnProfileReader,
    {
      build: jest.fn().mockResolvedValue(ctx),
      recordConversationTurn: jest.fn().mockResolvedValue(undefined),
    } as unknown as ChatContextService,
    {} as unknown as DiscoverPortfolioService,
    { get: () => 0 } as unknown as ConfigService,
    { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
    {
      readableThread: jest.fn(async (target: { conversationId: string | null }) => target.conversationId ?? undefined),
    } as unknown as ChatThreadDocumentsService,
  )
}

/** Le corps POSTé au service IA par la chaîne réelle, pour une dernière collecte donnée. */
async function bodySentToIa(workspaceLastSyncAt: string | null): Promise<Record<string, unknown>> {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue(sseDone())
  const dto = (await new ZodValidationPipe().transform(webBody(), {
    type: 'body',
    metatype: ChatDto,
  } as ArgumentMetadata)) as ChatDto
  await buildRealChain(chatContext(workspaceLastSyncAt)).chat(
    { userId: 'u-wlsa' } as CurrentUserPayload,
    dto,
    fakeRes(),
  )
  expect(mockFetch).toHaveBeenCalledTimes(1)
  const [url, init] = mockFetch.mock.calls[0]!
  expect(String(url)).toContain('/chat/message')
  return JSON.parse((init as RequestInit).body as string) as Record<string, unknown>
}

describe('/ia/chat — la dernière collecte connue de l’ESPACE voyage jusqu’au service IA (#2266.10)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('un espace dont la dernière collecte connue date du 20/12/2025 envoie workspace_last_sync_at à cette date', async () => {
    const sent = await bodySentToIa('2025-12-20T00:00:00.000Z')
    expect(sent['workspace_last_sync_at']).toBe('2025-12-20T00:00:00.000Z')
    // Preuve de lecture : le corps est bien le corps d'un tour, pas un objet vide.
    expect(sent['message']).toBe(webBody()['message'])
    expect(sent['first_name']).toBe('Louis')
  })

  it('TÉMOIN — un espace SANS collecte connue n’envoie aucune clé', async () => {
    const sent = await bodySentToIa(null)
    expect(sent).not.toHaveProperty('workspace_last_sync_at')
    expect(sent['message']).toBe(webBody()['message'])
  })
})
