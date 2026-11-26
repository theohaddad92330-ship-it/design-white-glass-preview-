/**
 * # LE FUSEAU DE LA PERSONNE VOYAGE-T-IL JUSQU'AU SERVICE IA ?
 *
 * Décision Louis, 14/09/2026 : « ajouter un fuseau par utilisateur ».
 *
 * Le défaut réparé : `apps/ia/app/prompts/current_time.py` fixait
 * `Europe/Paris` en dur, et son unique appelant de production
 * (`apps/ia/app/routers/chat.py`) ajoute ce bloc en queue du prompt système à
 * chaque tour. « Relance-la demain à 9 h » était donc résolu par le modèle
 * contre la date PARISIENNE, quel que soit l'endroit d'où on écrit.
 *
 * ⚠️ Pourquoi cette suite et pas seulement un test de `chatBody` : le défaut
 * n°1 du dépôt est du code juste que personne n'appelle. `ia.client.spec.ts`
 * prouverait que `chatBody` sait émettre la clé ; il ne prouverait pas que le
 * contrôleur la LIT dans le contexte. Comme `ia-proxy.chat-interface-language.spec.ts`,
 * cette suite rejoue le VRAI chemin, sans mock entre le contexte de chat et le
 * fil HTTP :
 *
 *   `ChatContext.timezone` → `IaProxyController.chat` réel → `IaClient.chatStream`
 *   réel → corps POSTé sur `/chat/message`.
 *
 * Les trois preuves :
 *  · elle sait dire NON — retirer `timezone: ctx.timezone ?? undefined` du
 *    contrôleur, ou le `...(input.timezone ? …)` de `chatBody`, la fait rougir ;
 *  · elle LIT quelque chose — le corps réellement sérialisé sur le fil, et on
 *    vérifie qu'il n'est pas vide (les autres clés du tour y sont) ;
 *  · elle n'attrape pas le cas voisin — le TÉMOIN : un profil SANS fuseau
 *    n'envoie AUCUNE clé, donc le service IA garde `REFERENCE_TIMEZONE` et le
 *    corps est celui d'avant ce lot.
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
    // Le geste EXACT du défaut mesuré : une date RELATIVE, que le modèle doit
    // résoudre contre le bloc de date du prompt.
    message: 'Rappelle-moi de relancer Sandrine Pata demain à 9 h 30',
    accountId: null,
    conversationId: 'c0ffee00-0000-4000-8000-000000000014',
    history: [],
    documentIds: [],
    clarificationAsked: false,
  }
}

function chatContext(timezone: string | null): ChatContext {
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
    timezone,
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

/** Le corps POSTé au service IA par la chaîne réelle, pour un fuseau donné. */
async function bodySentToIa(timezone: string | null): Promise<Record<string, unknown>> {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue(sseDone())
  const dto = (await new ZodValidationPipe().transform(webBody(), {
    type: 'body',
    metatype: ChatDto,
  } as ArgumentMetadata)) as ChatDto
  await buildRealChain(chatContext(timezone)).chat({ userId: 'u-tz' } as CurrentUserPayload, dto, fakeRes())
  expect(mockFetch).toHaveBeenCalledTimes(1)
  const [url, init] = mockFetch.mock.calls[0]!
  expect(String(url)).toContain('/chat/message')
  return JSON.parse((init as RequestInit).body as string) as Record<string, unknown>
}

describe('/ia/chat — le fuseau de la personne voyage jusqu’au service IA', () => {
  afterEach(() => jest.restoreAllMocks())

  it('un profil à MONTRÉAL envoie timezone: "America/Montreal"', async () => {
    const sent = await bodySentToIa('America/Montreal')
    expect(sent['timezone']).toBe('America/Montreal')
    // Preuve de lecture : le corps est bien le corps d'un tour, pas un objet vide.
    expect(sent['message']).toBe(webBody()['message'])
    expect(sent['first_name']).toBe('Louis')
  })

  it('un profil à SINGAPOUR envoie son fuseau, jamais celui du serveur', async () => {
    expect((await bodySentToIa('Asia/Singapore'))['timezone']).toBe('Asia/Singapore')
  })

  it('TÉMOIN — un profil SANS fuseau n’envoie aucune clé : le service IA garde Europe/Paris', async () => {
    const sent = await bodySentToIa(null)
    expect(sent).not.toHaveProperty('timezone')
    // Et rien d'autre n'a bougé : c'est le corps d'avant ce lot.
    expect(sent['message']).toBe(webBody()['message'])
  })
})
