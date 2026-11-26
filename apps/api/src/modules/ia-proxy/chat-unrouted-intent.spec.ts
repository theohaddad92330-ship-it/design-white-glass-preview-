import type { ConfigService } from '@nestjs/config'
import type { Response } from 'express'
import { can, workspacePermissionValues, type LauraPageContext } from '@bellum/contracts'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { ChatStreamEvent, IaClient } from '../ia/ia.client'
import type { LauraUnroutedIntentsService } from '../laura-unrouted-intents/laura-unrouted-intents.service'
import type { ToolRegistryService } from '../tool-registry/tool-registry.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ChatContext, ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import type { ChatDto } from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/**
 * #1949.23 — décision Louis 13/09 batch 12 : une demande que Laura n'a pas su
 * router laisse une trace ANONYME. Ce que le contrôleur de chat en fait :
 *  1. il ÉCRIT la trace après la réponse — jamais depuis une salle de démo ;
 *  2. il ne la RELAIE jamais au navigateur — l'enveloppe `done` reste celle
 *     d'avant, octet pour octet ;
 *  3. rien ne casse le tour quand la trace échoue ou que le module est absent.
 */

const user = { userId: 'u-1' } as CurrentUserPayload
// #1941.5/.8 — les droits d'un `owner` (le rôle par défaut de `build()` plus
// bas), DÉRIVÉS de la matrice RBAC — jamais recopiés à la main.
const OWNER_PERMISSIONS = workspacePermissionValues.filter(permission => can('owner', [], permission))

const CONTEXT: LauraPageContext = {
  kind: 'account',
  label: 'SOCOTEC CONSTRUCTION',
  entityId: '11111111-1111-4111-8111-111111111111',
  facets: [],
  state: 'ready',
}

const SIGNAL = { category: 'hors_perimetre', text: 'Quel temps fera-t-il à Paris ?' }

function fakeRes(): Response & { write: jest.Mock } {
  return { setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn() } as unknown as Response & {
    write: jest.Mock
  }
}

function build(opts: {
  data: Record<string, unknown>
  demo?: boolean
  intents?: Partial<LauraUnroutedIntentsService> | null
}) {
  const ia = {
    chatStream: jest.fn().mockImplementation(async function* (): AsyncGenerator<ChatStreamEvent> {
      yield { type: 'done', success: true, data: opts.data }
    }),
  } as unknown as jest.Mocked<Pick<IaClient, 'chatStream'>>
  const chatCtx: ChatContext = {
    accountData: null,
    contactsSummary: null,
    planSummary: null,
    accountsSummary: null,
    profileData: {},
    pinnedFacts: [],
    // #1916.24 — les identifiants des éléments de mémoire envoyés : cette suite
    // ne prouve pas la trace, elle prouve la demande non routée.
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
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    extraPermissionsOf: jest.fn().mockResolvedValue([]),
    isDemoWorkspace: jest.fn().mockResolvedValue(opts.demo ?? false),
  }
  const intents =
    opts.intents === null ? undefined : { record: jest.fn().mockResolvedValue('written'), ...(opts.intents ?? {}) }
  const controller = new IaProxyController(
    ia as unknown as IaClient,
    { listThread: jest.fn(), create: jest.fn(), listHistory: jest.fn() } as unknown as ChatMessagesService,
    workspaceContext as unknown as WorkspaceContextService,
    { resolveProfileData: jest.fn().mockResolvedValue({}) } as unknown as EsnProfileReader,
    {
      build: jest.fn().mockResolvedValue(chatCtx),
      recordConversationTurn: jest.fn().mockResolvedValue(undefined),
    } as unknown as ChatContextService,
    { resolve: jest.fn().mockResolvedValue([]) } as unknown as DiscoverPortfolioService,
    { get: () => 0 } as unknown as ConfigService,
    { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
    // #1954 — obligatoire, en 9e position. Transparent : le fil demandé est le fil
    // lu, cette suite prouve la trace non routée, pas la lisibilité du fil.
    {
      readableThread: jest.fn(async (target: { conversationId: string | null }) => target.conversationId ?? undefined),
    } as unknown as ChatThreadDocumentsService,
    undefined,
    undefined,
    undefined,
    // Le titre des fils (#1911.1), la marque de l'espace (#1960.20), les cartes
    // de Laura (#1943 L3), les consultants et les besoins ouverts (#1951.2 /
    // #1951.3), le palier du plan (#1957), la trace des éléments de mémoire
    // (#1916.24) et les retours sur les réponses (#1919.15) — paramètres
    // précédents en position (13ᵉ à 20ᵉ), absents ici.
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    intents as unknown as LauraUnroutedIntentsService | undefined,
  )
  return { controller, intents, workspaceContext }
}

const DTO = { message: 'Quel temps fera-t-il à Paris ?', pageContext: CONTEXT, interfaceLanguage: 'en' } as ChatDto

describe('#1949.23 — le contrôleur de chat et la trace anonyme d’une demande non routée', () => {
  it('ÉCRIT la trace : le signal, l’espace (haché par le service), la NATURE de l’écran et la langue', async () => {
    const { controller, intents } = build({ data: { reply: 'Je ne donne pas la météo.', unrouted_intent: SIGNAL } })

    await controller.chat(user, DTO, fakeRes())

    expect(intents?.record).toHaveBeenCalledTimes(1)
    expect(intents?.record).toHaveBeenCalledWith({
      signal: SIGNAL,
      workspaceId: 'ws-1',
      surface: 'account',
      language: 'en',
    })
  })

  it('ne relaie JAMAIS le signal au navigateur — la réponse, elle, arrive', async () => {
    const { controller } = build({ data: { reply: 'Je ne donne pas la météo.', unrouted_intent: SIGNAL } })
    const res = fakeRes()

    await controller.chat(user, DTO, res)

    const written = res.write.mock.calls.map(call => String(call[0])).join('')
    expect(written).toContain('Je ne donne pas la météo.')
    expect(written).not.toContain('unrouted_intent')
    expect(written).not.toContain('hors_perimetre')
  })

  it('sans signal : aucune trace, et l’enveloppe `done` est celle d’avant, au caractère près', async () => {
    const { controller, intents } = build({ data: { reply: 'ok', context: { actions: [] } } })
    const res = fakeRes()

    await controller.chat(user, DTO, res)

    expect(intents?.record).not.toHaveBeenCalled()
    expect(res.write).toHaveBeenCalledWith(
      // #1941.5/.8 — `permissions` s'ajoute au `context` de TOUT tour réussi,
      // indépendamment du signal « demande non routée » : ce test prouve que
      // CE retrait-là ne change rien d'autre, pas que le payload est figé.
      `data: ${JSON.stringify({ type: 'done', success: true, data: { reply: 'ok', context: { actions: [], permissions: OWNER_PERMISSIONS } } })}\n\n`,
    )
  })

  it('une salle de DÉMONSTRATION n’écrit rien', async () => {
    const { controller, intents } = build({ data: { reply: 'x', unrouted_intent: SIGNAL }, demo: true })

    // #1942.2 / #1942.12 — le tour lui-même est refusé en démonstration : il n'y
    // a donc même pas d'enveloppe d'où un signal pourrait être tiré.
    await expect(controller.chat(user, DTO, fakeRes())).rejects.toMatchObject({ status: 400 })

    expect(intents?.record).not.toHaveBeenCalled()
  })

  it('un signal mal formé n’est pas écrit', async () => {
    const { controller, intents } = build({ data: { reply: 'x', unrouted_intent: { category: 'meteo', text: 'x' } } })

    await controller.chat(user, DTO, fakeRes())

    expect(intents?.record).not.toHaveBeenCalled()
  })

  it('une trace en échec ne casse pas le tour', async () => {
    const { controller } = build({
      data: { reply: 'x', unrouted_intent: SIGNAL },
      intents: { record: jest.fn().mockRejectedValue(new Error('boom')) },
    })
    const res = fakeRes()

    await expect(controller.chat(user, DTO, res)).resolves.toBeUndefined()
    expect(res.end).toHaveBeenCalled()
  })

  it('sans le module (règle #7) : le chat répond à l’identique, sans trace', async () => {
    const { controller } = build({ data: { reply: 'x', unrouted_intent: SIGNAL }, intents: null })
    const res = fakeRes()

    await expect(controller.chat(user, DTO, res)).resolves.toBeUndefined()
    expect(res.write.mock.calls.map(call => String(call[0])).join('')).not.toContain('unrouted_intent')
  })
})
