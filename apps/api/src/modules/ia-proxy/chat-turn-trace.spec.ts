/**
 * # #2442.3 / #2442.4 — LE TOUR DE LAURA EST-IL UNE SEULE TRACE, DE L'API AU SERVICE IA ?
 *
 * Le trace_id voyage déjà (le correlation-id posé par le middleware, recopié par
 * `HttpClient.streamSse` en `x-correlation-id`, repris par `derive_trace_id` côté
 * IA — #2442.2). Il manquait à la trace ce que SEULE l'API sait : l'identifiant du
 * MESSAGE (`turnId`, la moitié de la clé des cartes) et la durée de ses propres
 * étapes avant le service IA (quota, résolution du contexte). Ils voyagent dans
 * `x-bellum-turn`, que la route IA pose sur la trace du tour.
 *
 * Les trois preuves (comme `ia-proxy.chat-timezone.spec.ts`, chaîne RÉELLE
 * contrôleur → `IaClient.chatStream` → fil HTTP) :
 *  · elle sait dire NON — retirer `headers: chatTurnClock.header(turnId)` du contrôleur,
 *    ou le `headers` de `chatStream`, la fait rougir ;
 *  · elle LIT quelque chose — l'en-tête réellement posé sur le fil ;
 *  · rien de personnel n'y passe — ni le texte, ni l'utilisateur, ni l'espace.
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
import { CHAT_TURN_TRACE_HEADER, ChatTurnClock } from './chat-turn-trace'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import { ChatDto } from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

const TURN_ID = 'c0ffee00-0000-4000-8000-000000002442'
const USER_ID = '9d359267-f7ee-430f-a614-2044a2e77ab5'
const WORKSPACE_ID = '11111111-2222-4333-8444-555555555555'
const MESSAGE = 'Relance jean.dupont@acme.fr sur le budget confidentiel'

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

function chatContext(): ChatContext {
  return {
    accountData: {},
    contactsSummary: '',
    planSummary: '',
    accountsSummary: '',
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
  }
}

function buildRealChain(): IaProxyController {
  const ia = new IaClient({ get: () => 'http://ia.test' } as unknown as ConfigService, new CorrelationIdService())
  return new IaProxyController(
    ia,
    { markPrecisionRequest: jest.fn() } as unknown as ChatMessagesService,
    {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE_ID, role: 'owner' }),
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
    } as unknown as WorkspaceContextService,
    {} as unknown as EsnProfileReader,
    {
      build: jest.fn().mockResolvedValue(chatContext()),
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

async function headersSentToIa(): Promise<Record<string, string>> {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue(sseDone())
  const dto = (await new ZodValidationPipe().transform(
    { message: MESSAGE, accountId: null, history: [], documentIds: [], clarificationAsked: false, turnId: TURN_ID },
    { type: 'body', metatype: ChatDto } as ArgumentMetadata,
  )) as ChatDto
  await buildRealChain().chat({ userId: USER_ID } as CurrentUserPayload, dto, fakeRes())
  expect(mockFetch).toHaveBeenCalledTimes(1)
  const [url, init] = mockFetch.mock.calls[0]!
  expect(String(url)).toContain('/chat/message')
  return (init as RequestInit).headers as Record<string, string>
}

describe('ChatTurnClock — ce que l’API dit de son tour', () => {
  it('porte l’identifiant du message et la durée de chaque étape, en millisecondes entières', () => {
    let now = 1_000
    const clock = new ChatTurnClock(() => now)
    now += 12
    clock.lap('quota')
    now += 340
    clock.lap('context')
    expect(clock.header(TURN_ID)).toEqual({ [CHAT_TURN_TRACE_HEADER]: `id=${TURN_ID};quota=12;context=340` })
  })

  it('un identifiant qui n’est pas un UUID ne voyage pas — les étapes, si', () => {
    const clock = new ChatTurnClock(() => 0)
    clock.lap('quota')
    expect(clock.header('pas un uuid; injection=1')).toEqual({ [CHAT_TURN_TRACE_HEADER]: 'quota=0' })
  })

  it('une étape jamais mesurée n’a pas de clé — jamais « 0 »', () => {
    const clock = new ChatTurnClock(() => 5)
    expect(clock.header(TURN_ID)).toEqual({ [CHAT_TURN_TRACE_HEADER]: `id=${TURN_ID}` })
    // Rien à dire : AUCUN en-tête, jamais une valeur vide.
    expect(clock.header('')).toEqual({})
  })

  it('#2442.4 (épopée #2879) — `startedAt` fait démarrer l’horloge AVANT la construction, pour le span « auth »', () => {
    // `startedAt` = l'instant de réception posé par le middleware ; le premier
    // `.lap('auth')` mesure alors tout ce qui s'est écoulé entre la réception
    // et l'entrée dans le contrôleur (routage + guards), pas depuis la
    // construction de l'horloge elle-même.
    let now = 1_000
    const clock = new ChatTurnClock(() => now, 940)
    clock.lap('auth')
    now += 12
    clock.lap('quota')
    expect(clock.header(TURN_ID)).toEqual({ [CHAT_TURN_TRACE_HEADER]: `id=${TURN_ID};auth=60;quota=12` })
  })

  it('sans `startedAt`, aucun span « auth » n’est posé — non mesuré, jamais un zéro devenu fait', () => {
    const clock = new ChatTurnClock(() => 5)
    clock.lap('quota')
    expect(clock.header(TURN_ID)).toEqual({ [CHAT_TURN_TRACE_HEADER]: `id=${TURN_ID};quota=0` })
  })
})

describe('/ia/chat — l’en-tête du tour voyage jusqu’au service IA', () => {
  afterEach(() => jest.restoreAllMocks())

  it('le fil porte x-bellum-turn : id du message + quota + contexte', async () => {
    const headers = await headersSentToIa()
    const value = headers[CHAT_TURN_TRACE_HEADER]
    expect(value).toMatch(new RegExp(`^id=${TURN_ID};quota=\\d+;context=\\d+$`))
  })

  it('rien de personnel dans l’en-tête : ni texte, ni utilisateur, ni espace', async () => {
    const value = (await headersSentToIa())[CHAT_TURN_TRACE_HEADER] ?? ''
    expect(value).not.toBe('')
    for (const forbidden of [USER_ID, WORKSPACE_ID, 'jean.dupont', 'confidentiel']) {
      expect(value).not.toContain(forbidden)
    }
  })
})
