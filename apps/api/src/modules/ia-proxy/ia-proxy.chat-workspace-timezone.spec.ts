/**
 * # LE FUSEAU DE L'ESPACE VOYAGE-T-IL JUSQU'AU SERVICE IA ?
 *
 * #1958.2 — jusqu'ici seuls existaient le fuseau de la PERSONNE
 * (`ia-proxy.chat-timezone.spec.ts`, décision Louis 14/09/2026) et le défaut
 * produit nommé (`REFERENCE_TIMEZONE`) : aucun fuseau n'était porté par
 * l'ESPACE (l'ESN). Une équipe dont personne n'avait rempli son fuseau
 * personnel retombait donc directement sur Paris, même basée à Montréal.
 *
 * Même chemin, même preuve en trois parties que le fuseau de la personne :
 *
 *   `ChatContext.workspaceTimezone` → `IaProxyController.chat` réel →
 *   `IaClient.chatStream` réel → corps POSTé sur `/chat/message`.
 *
 *  · elle sait dire NON — retirer `workspaceTimezone: ctx.workspaceTimezone ??
 *    undefined` du contrôleur, ou le `...(input.workspaceTimezone ? …)` de
 *    `chatBody`, la fait rougir ;
 *  · elle LIT quelque chose — le corps réellement sérialisé sur le fil, et on
 *    vérifie qu'il n'est pas vide (les autres clés du tour y sont) ;
 *  · elle n'attrape pas le cas voisin — le TÉMOIN : un espace SANS fuseau
 *    n'envoie AUCUNE clé, donc le service IA garde son escalier d'avant ce lot.
 */
const mockFetch = jest.fn()
// Fermeture PARESSEUSE : `jest.mock` est remonté au-dessus de la déclaration.
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
    message: 'Rappelle-moi de relancer Sandrine Pata demain à 9 h 30',
    accountId: null,
    conversationId: 'c0ffee00-0000-4000-8000-000000000015',
    history: [],
    documentIds: [],
    clarificationAsked: false,
  }
}

function chatContext(workspaceTimezone: string | null): ChatContext {
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
    // Le TÉMOIN de la marche du dessus : la personne n'a RIEN réglé, sinon son
    // fuseau gagnerait et masquerait celui de l'espace qu'on veut prouver ici.
    timezone: null,
    workspaceTimezone,
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

/** Le corps POSTé au service IA par la chaîne réelle, pour un fuseau d'espace donné. */
async function bodySentToIa(workspaceTimezone: string | null): Promise<Record<string, unknown>> {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue(sseDone())
  const dto = (await new ZodValidationPipe().transform(webBody(), {
    type: 'body',
    metatype: ChatDto,
  } as ArgumentMetadata)) as ChatDto
  await buildRealChain(chatContext(workspaceTimezone)).chat({ userId: 'u-wtz' } as CurrentUserPayload, dto, fakeRes())
  expect(mockFetch).toHaveBeenCalledTimes(1)
  const [url, init] = mockFetch.mock.calls[0]!
  expect(String(url)).toContain('/chat/message')
  return JSON.parse((init as RequestInit).body as string) as Record<string, unknown>
}

describe('/ia/chat — le fuseau de l’ESPACE voyage jusqu’au service IA (#1958.2)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('un espace basé à MONTRÉAL envoie workspace_timezone: "America/Montreal"', async () => {
    const sent = await bodySentToIa('America/Montreal')
    expect(sent['workspace_timezone']).toBe('America/Montreal')
    // Preuve de lecture : le corps est bien le corps d'un tour, pas un objet vide.
    expect(sent['message']).toBe(webBody()['message'])
    expect(sent['first_name']).toBe('Louis')
    // Et le fuseau PERSONNEL, absent ici, ne part pas — sinon ce test prouverait
    // le mauvais champ.
    expect(sent).not.toHaveProperty('timezone')
  })

  it('un espace basé à SINGAPOUR envoie son fuseau, jamais celui du serveur', async () => {
    expect((await bodySentToIa('Asia/Singapore'))['workspace_timezone']).toBe('Asia/Singapore')
  })

  it('TÉMOIN — un espace SANS fuseau n’envoie aucune clé : le service IA garde son escalier d’avant ce lot', async () => {
    const sent = await bodySentToIa(null)
    expect(sent).not.toHaveProperty('workspace_timezone')
    // Et rien d'autre n'a bougé : c'est le corps d'avant ce lot.
    expect(sent['message']).toBe(webBody()['message'])
  })
})
