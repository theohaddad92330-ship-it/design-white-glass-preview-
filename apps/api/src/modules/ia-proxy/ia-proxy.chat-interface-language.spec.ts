/**
 * # Recette du 13/09 — interface en anglais, réponse en français : le TRANSPORT est-il en cause ?
 *
 * Mesuré en production (API et IA au SHA `f62f2d6a9`) : `POST /ia/chat` avec
 * `interfaceLanguage: 'en'` et un message en français rendait une réponse en
 * français, deux tours de suite.
 *
 * `ia-proxy.controller.spec.ts` prouve que le contrôleur PASSE le champ à un
 * `IaClient` MOCKÉ, et `ia.client.spec.ts` que `chatStream` l'émet quand on
 * l'appelle à la main. Deux maillons verts séparément ne prouvent pas la
 * chaîne. Cette suite rejoue le VRAI chemin d'une requête web, sans aucun mock
 * entre le corps du navigateur et le fil HTTP vers le service IA :
 *
 *   corps de `laura-turn.ts::chatRequestBody` → `ZodValidationPipe` global
 *   (`main.ts`) → `IaProxyController.chat` réel → `IaClient.chatStream` réel
 *   → corps POSTé sur `/chat/message`.
 *
 * Seul le bout du fil est simulé (`undici.fetch`, comme `ia.client.spec.ts`).
 */
const mockFetch = jest.fn()
// Fermeture PARESSEUSE : `jest.mock` est remonté au-dessus de la déclaration,
// et `@bellum/http` évalue la fabrique dès son import (via le contrôleur).
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
    `data: ${JSON.stringify({ type: 'done', success: true, data: { reply: 'You follow 27 accounts.' } })}\n\n`,
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

/** Le corps EXACT de `apps/web/src/features/chat/api/laura-turn.ts::chatRequestBody`
 *  pour le geste mesuré en production (fil neuf, aucun compte, aucun historique). */
function webBody(interfaceLanguage?: 'fr' | 'en'): Record<string, unknown> {
  return {
    message: 'RECETTE — 2026-09-13 — en une phrase, combien de comptes je suis en ce moment ?',
    accountId: null,
    conversationId: 'c0ffee00-0000-4000-8000-000000000013',
    history: [],
    documentIds: [],
    clarificationAsked: false,
    ...(interfaceLanguage ? { interfaceLanguage } : {}),
  }
}

function buildRealChain() {
  const ia = new IaClient({ get: () => 'http://ia.test' } as unknown as ConfigService, new CorrelationIdService())
  const chatCtx: ChatContext = {
    accountData: {},
    contactsSummary: '',
    planSummary: '',
    accountsSummary: 'SNCF — Transport — 7/10',
    profileData: { companyName: 'MonESN' },
    pinnedFacts: [],
    // #1916.24 — la liste des identifiants envoyés, vide comme `pinnedFacts`.
    pinnedFactIds: [],
    userPreferences: {},
    conversationSummary: '',
    crmConnected: false,
    crmProvider: null,
    crmPresence: null,
    accountFeedback: '',
    toolsSummary: '',
    firstName: 'Louis',
    // TÉMOIN — aucun fuseau sur ce profil : le service IA garde son fuseau de
    // RÉFÉRENCE (Europe/Paris), et le corps envoyé reste byte-identique.
    timezone: null,
  }
  const controller = new IaProxyController(
    ia,
    { markPrecisionRequest: jest.fn() } as unknown as ChatMessagesService,
    {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
      // #1942.2 / #1942.12 — un espace ORDINAIRE : le tour part. La salle de
      // démonstration, elle, refuse avant tout appel (`chat-demo-guard.spec.ts`).
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
    } as unknown as WorkspaceContextService,
    {} as unknown as EsnProfileReader,
    {
      build: jest.fn().mockResolvedValue(chatCtx),
      recordConversationTurn: jest.fn().mockResolvedValue(undefined),
    } as unknown as ChatContextService,
    {} as unknown as DiscoverPortfolioService,
    // Plafond désactivé : cette suite prouve le transport, pas la borne.
    { get: () => 0 } as unknown as ConfigService,
    { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
    // #1954 — dépendance OBLIGATOIRE du contrôleur (lot 2b), avant les
    // `@Optional()` : un fil vivant se transmet tel quel.
    {
      readableThread: jest.fn(async (target: { conversationId: string | null }) => target.conversationId ?? undefined),
    } as unknown as ChatThreadDocumentsService,
  )
  return controller
}

/** Le corps POSTé au service IA par la chaîne réelle, pour un corps web donné. */
async function bodySentToIa(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue(sseDone())
  // Le pipe GLOBAL de `main.ts` — c'est lui qui transforme le JSON du navigateur
  // en `ChatDto` ; un champ qu'il avalerait n'atteindrait jamais le contrôleur.
  const dto = (await new ZodValidationPipe().transform(body, {
    type: 'body',
    metatype: ChatDto,
  } as ArgumentMetadata)) as ChatDto
  await buildRealChain().chat({ userId: 'u-recette' } as CurrentUserPayload, dto, fakeRes())
  expect(mockFetch).toHaveBeenCalledTimes(1)
  const [url, init] = mockFetch.mock.calls[0]!
  expect(String(url)).toContain('/chat/message')
  return JSON.parse((init as RequestInit).body as string) as Record<string, unknown>
}

describe('/ia/chat — la langue de l’interface voyage du navigateur au service IA (recette du 13/09)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('une requête web en interface ANGLAISE envoie interface_language: "en" au service IA', async () => {
    const sent = await bodySentToIa(webBody('en'))
    expect(sent['interface_language']).toBe('en')
    // Le message reste celui tapé — la langue ne se devine jamais depuis lui.
    expect(sent['message']).toBe(webBody('en')['message'])
  })

  it('une requête web en interface FRANÇAISE envoie interface_language: "fr"', async () => {
    const sent = await bodySentToIa(webBody('fr'))
    expect(sent['interface_language']).toBe('fr')
  })

  it('un onglet ouvert avant #1958.8 (sans le champ) n’envoie aucune clé — le service IA retombe sur le français', async () => {
    const sent = await bodySentToIa(webBody())
    expect(sent).not.toHaveProperty('interface_language')
  })
})
