/**
 * # LA PÉRIODE DE L'ESPACE VOYAGE-T-ELLE JUSQU'AU SERVICE IA ?
 *
 * #2266.8 (épopée #2920) — DEPUIS QUAND l'espace utilise Bellum n'atteignait
 * jamais le service IA : aucune invite du chat ne pouvait dater l'ancienneté
 * de l'espace, donc Laura ne pouvait jamais dire « cet espace vient d'être
 * créé » ni s'empêcher de sous-entendre un historique plus vieux qu'il ne l'est.
 *
 * Même patron, même preuve en trois parties que `ia-proxy.chat-workspace-timezone.spec.ts` :
 *
 *   `ChatContext.workspaceCreatedAt` → `IaProxyController.chat` réel →
 *   `IaClient.chatStream` réel → corps POSTé sur `/chat/message`.
 *
 *  · elle sait dire NON — retirer `workspaceCreatedAt: ctx.workspaceCreatedAt
 *    ?? undefined` du contrôleur, ou le `...(input.workspaceCreatedAt ? …)`
 *    de `chatBody`, la fait rougir ;
 *  · elle LIT quelque chose — le corps réellement sérialisé sur le fil ;
 *  · elle n'attrape pas le cas voisin — le TÉMOIN : un espace SANS date de
 *    création connue n'envoie AUCUNE clé.
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
    message: 'Depuis quand on utilise Bellum ici ?',
    accountId: null,
    conversationId: 'c0ffee00-0000-4000-8000-000000000016',
    history: [],
    documentIds: [],
    clarificationAsked: false,
  }
}

function chatContext(workspaceCreatedAt: string | null): ChatContext {
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
    workspaceCreatedAt,
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

/** Le corps POSTé au service IA par la chaîne réelle, pour une date de création d'espace donnée. */
async function bodySentToIa(workspaceCreatedAt: string | null): Promise<Record<string, unknown>> {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue(sseDone())
  const dto = (await new ZodValidationPipe().transform(webBody(), {
    type: 'body',
    metatype: ChatDto,
  } as ArgumentMetadata)) as ChatDto
  await buildRealChain(chatContext(workspaceCreatedAt)).chat({ userId: 'u-wca' } as CurrentUserPayload, dto, fakeRes())
  expect(mockFetch).toHaveBeenCalledTimes(1)
  const [url, init] = mockFetch.mock.calls[0]!
  expect(String(url)).toContain('/chat/message')
  return JSON.parse((init as RequestInit).body as string) as Record<string, unknown>
}

describe('/ia/chat — la période de l’ESPACE voyage jusqu’au service IA (#2266.8)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('un espace créé le 15/01/2026 envoie workspace_created_at à cette date', async () => {
    const sent = await bodySentToIa('2026-01-15T00:00:00.000Z')
    expect(sent['workspace_created_at']).toBe('2026-01-15T00:00:00.000Z')
    // Preuve de lecture : le corps est bien le corps d'un tour, pas un objet vide.
    expect(sent['message']).toBe(webBody()['message'])
    expect(sent['first_name']).toBe('Louis')
  })

  it('TÉMOIN — un espace SANS date de création connue n’envoie aucune clé', async () => {
    const sent = await bodySentToIa(null)
    expect(sent).not.toHaveProperty('workspace_created_at')
    expect(sent['message']).toBe(webBody()['message'])
  })
})
