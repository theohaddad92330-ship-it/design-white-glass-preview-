import { Logger, NotFoundException, RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import type { ConfigService } from '@nestjs/config'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { ProviderCostService } from '../analytics/provider-cost.service'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { IaClient } from '../ia/ia.client'
import { REQUIRE_FEATURE_KEY } from '../plan-features/require-feature.decorator'
import type { ToolRegistryService } from '../tool-registry/tool-registry.service'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { ChatThreadTitlesService } from './chat-thread-titles.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import type {
  ChatThreadTargetDto,
  CreateChatMessageDto,
  ListChatHistoryDto,
  RenameChatThreadDto,
} from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/**
 * #1911.1 / #1911.12 / #1955.1 — les routes du titre d'un fil.
 *
 * Le renommage suit EXACTEMENT la règle de visibilité de l'archivage : même
 * palier, même permission, espace résolu depuis le jeton et jamais depuis le
 * corps. La rédaction par Laura part en tâche de fond après l'écriture d'une
 * réponse, sans jamais retarder le tour de la personne, et jamais en démo.
 */

const USER = { userId: 'u-1' } as CurrentUserPayload
const SECRET = 'Prépare mon rendez-vous avec la SNCF jeudi'
const flush = () => new Promise(resolve => setImmediate(resolve))

function build(options: { demo?: boolean | Error; providerCosts?: ProviderCostService } = {}) {
  const chatMessages = {
    create: jest.fn().mockResolvedValue({ id: 'm-1' }),
    listHistory: jest.fn().mockResolvedValue([
      {
        id: 'm-1',
        account_id: null,
        conversation_id: 'c-1',
        title: SECRET,
        created_at: new Date(),
        last_message_at: new Date(),
      },
    ]),
    // #1911.15 — l'appelant ('u-1') EST l'auteur par défaut : cette suite
    // prouve l'ordre titre/messages, pas la permission.
    threadAuthor: jest.fn().mockResolvedValue('u-1'),
    deleteThread: jest.fn().mockResolvedValue(4),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    extraPermissionsOf: jest.fn().mockResolvedValue([]),
    isDemoWorkspace:
      options.demo instanceof Error
        ? jest.fn().mockRejectedValue(options.demo)
        : jest.fn().mockResolvedValue(options.demo ?? false),
  }
  const threadTitles = {
    rename: jest.fn().mockResolvedValue({ title: 'Préparer le RDV SNCF', title_source: 'user' }),
    titleAfterReply: jest.fn().mockResolvedValue('written'),
    withStoredTitles: jest.fn(async (_workspaceId: string, _userId: string, items: object[]) =>
      items.map(item => ({ ...item, title: 'Préparer le rendez-vous SNCF', title_source: 'laura' })),
    ),
    forget: jest.fn().mockResolvedValue(undefined),
  }
  const threadDocuments = {
    readableThread: jest.fn().mockResolvedValue(undefined),
    deleteForThread: jest.fn().mockResolvedValue(0),
  }
  const controller = new IaProxyController(
    {} as IaClient,
    chatMessages as unknown as ChatMessagesService,
    workspaceContext as unknown as WorkspaceContextService,
    {} as EsnProfileReader,
    {} as ChatContextService,
    {} as DiscoverPortfolioService,
    { get: () => 0 } as unknown as ConfigService,
    { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
    // #1954 — dépendance OBLIGATOIRE, avant les `@Optional()` : sans elle, les
    // paramètres suivants glissaient d'un cran et le titre n'était plus fourni.
    threadDocuments as unknown as ChatThreadDocumentsService,
    options.providerCosts,
    undefined,
    undefined,
    threadTitles as unknown as ChatThreadTitlesService,
  )
  return { controller, chatMessages, workspaceContext, threadTitles }
}

afterEach(() => jest.restoreAllMocks())

describe('PATCH /ia/chat/threads/title — renommer un fil (#1911.12, #1955.1)', () => {
  const rename = IaProxyController.prototype.renameChatThread
  const archive = IaProxyController.prototype.archiveChatThread

  it('est une route PATCH, à côté de l’archivage', () => {
    expect(Reflect.getMetadata(METHOD_METADATA, rename)).toBe(RequestMethod.PATCH)
    expect(Reflect.getMetadata(PATH_METADATA, rename)).toBe('chat/threads/title')
  })

  it('porte la MÊME règle de visibilité que l’archivage : même palier, même permission', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, rename)).toEqual(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, archive),
    )
    expect(Reflect.getMetadata(REQUIRE_FEATURE_KEY, rename)).toEqual(Reflect.getMetadata(REQUIRE_FEATURE_KEY, archive))
    // Sait dire NON : la garde lit bien quelque chose — une route sans
    // permission rendrait `undefined` des deux côtés et passerait l'égalité.
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, rename)).toBeDefined()
    expect(Reflect.getMetadata(REQUIRE_FEATURE_KEY, rename)).toBe('chat_ai')
  })

  it('résout l’espace depuis le jeton, jamais depuis le corps', async () => {
    const { controller, workspaceContext, threadTitles } = build()
    const result = await controller.renameChatThread(USER, {
      conversationId: 'c-1',
      accountId: null,
      title: 'Préparer le RDV SNCF',
    } as RenameChatThreadDto)
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(threadTitles.rename).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      userId: 'u-1',
      accountId: null,
      conversationId: 'c-1',
      title: 'Préparer le RDV SNCF',
    })
    expect(result).toEqual({ title: 'Préparer le RDV SNCF', title_source: 'user' })
  })

  it('sait dire NON — un fil absent de cet espace rend 404, pas un succès vide', async () => {
    const { controller, threadTitles } = build()
    threadTitles.rename.mockResolvedValueOnce(null)
    await expect(
      controller.renameChatThread(USER, { conversationId: 'autre-espace', title: 'X' } as RenameChatThreadDto),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('POST /ia/chat/messages — Laura titre le fil en tâche de fond (#1911.1)', () => {
  const assistantReply = {
    accountId: null,
    conversationId: 'c-1',
    role: 'assistant',
    content: 'Réponse',
  } as CreateChatMessageDto

  it('rend la main SANS attendre le titre — le tour de la personne ne dépend pas du modèle', async () => {
    const { controller, threadTitles } = build()
    // Un titre qui ne revient jamais : si la route l'attendait, ce test pendrait.
    threadTitles.titleAfterReply.mockReturnValueOnce(new Promise(() => undefined))
    await expect(controller.createChatMessage(USER, assistantReply)).resolves.toEqual({ message: { id: 'm-1' } })
    await flush()
    expect(threadTitles.titleAfterReply).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: 'c-1',
        // #1911.1 — le relais de l'en-tête de coût, lu par le contrôleur.
        onCostHeader: expect.any(Function),
      }),
    )
  })

  it('sait dire NON — un message de la personne ne déclenche rien', async () => {
    const { controller, threadTitles } = build()
    await controller.createChatMessage(USER, { ...assistantReply, role: 'user' } as CreateChatMessageDto)
    await flush()
    expect(threadTitles.titleAfterReply).not.toHaveBeenCalled()
  })

  it('zéro appel de modèle en démonstration', async () => {
    const { controller, workspaceContext, threadTitles } = build({ demo: true })
    await controller.createChatMessage(USER, assistantReply)
    await flush()
    expect(workspaceContext.isDemoWorkspace).toHaveBeenCalledWith('u-1')
    expect(threadTitles.titleAfterReply).not.toHaveBeenCalled()
  })

  it('une panne en tâche de fond ne remonte pas, et ne journalise aucun mot du fil', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const { controller, threadTitles } = build({ demo: new Error(`lecture impossible — ${SECRET}`) })
    await expect(controller.createChatMessage(USER, assistantReply)).resolves.toBeDefined()
    await flush()
    expect(threadTitles.titleAfterReply).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(error.mock.calls)).not.toContain('SNCF')
  })
})

describe('la liste et la suppression suivent le titre', () => {
  it('GET /ia/chat/history montre le titre stocké', async () => {
    const { controller, chatMessages, threadTitles } = build()
    const result = await controller.listChatHistory(USER, { limit: 20 } as ListChatHistoryDto)
    // #2703 — le lecteur voyage jusqu'aux titres : ses fils par défaut sont les siens.
    expect(threadTitles.withStoredTitles).toHaveBeenCalledWith(
      'ws-1',
      USER.userId,
      await chatMessages.listHistory.mock.results[0].value,
    )
    expect(result.items[0]).toMatchObject({ title: 'Préparer le rendez-vous SNCF', title_source: 'laura' })
  })

  it('supprimer un fil efface d’abord son titre, dans le même espace', async () => {
    const { controller, chatMessages, threadTitles } = build()
    await controller.deleteChatThread(USER, { conversationId: 'c-1', accountId: null } as ChatThreadTargetDto)
    expect(threadTitles.forget).toHaveBeenCalledWith({
      userId: USER.userId,
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'c-1',
    })
    expect(threadTitles.forget.mock.invocationCallOrder[0]).toBeLessThan(
      chatMessages.deleteThread.mock.invocationCallOrder[0],
    )
  })
})

/**
 * #1911.1 — le coût RÉEL de chaque titre rédigé, dans `provider_costs`.
 *
 * Même porte que le tour de chat (`ia-proxy.controller.ts`, `providerCosts.record`
 * après `chatStream`), l'enrichissement (`contacts.service.ts`) et le plan de
 * besoin (`need-play.service.ts`) : l'en-tête `x-bellum-costs` que le service IA
 * remplit avec l'usage mesuré. Le VRAI `ProviderCostService` tourne ici, sur un
 * dépôt simulé : ce qu'on vérifie, c'est la ligne qui serait insérée.
 */
describe('POST /ia/chat/messages — le coût réel du titre part dans provider_costs (#1911.1)', () => {
  const assistantReply = {
    accountId: 'a-1',
    conversationId: 'c-1',
    role: 'assistant',
    content: 'Réponse',
  } as CreateChatMessageDto

  function withCosts(header: string | null, demo = false) {
    const repo = { insert: jest.fn().mockResolvedValue({}) }
    const built = build({ demo, providerCosts: new ProviderCostService(repo as never) })
    built.threadTitles.titleAfterReply.mockImplementation(async (args: { onCostHeader?: (value: string) => void }) => {
      if (header !== null) args.onCostHeader?.(header)
      return 'written'
    })
    return { ...built, repo }
  }

  const settle = async () => {
    for (let i = 0; i < 5; i += 1) await flush()
  }

  it('enregistre les jetons et le coût RÉELS rendus par l’IA, rattachés à l’espace et à la personne — sans contenu', async () => {
    const header = '[{"provider":"anthropic","operation":"bellum_chat_title","calls":1,"units":492,"cost_usd":0.00054}]'
    const { controller, repo } = withCosts(header)

    await controller.createChatMessage(USER, assistantReply)
    await settle()

    expect(repo.insert).toHaveBeenCalledWith([
      {
        workspace_id: 'ws-1',
        user_id: 'u-1',
        account_id: 'a-1',
        run_id: null,
        // Le copilote est la famille « coûte sans débiter de crédit »
        // (`UNCREDITED_COST_FEATURES`) ; le PROMPT distingue le titre du tour.
        feature: 'chat',
        provider: 'anthropic',
        operation: 'bellum_chat_title',
        calls: 1,
        units: 492,
        cost_usd: '0.00054',
        environment: expect.any(String),
        // #3717.7 (DEC-4036) — la ligne porte l'identifiant de corrélation de la requête ; appelé hors
        // du middleware (test unitaire), il n'y en a pas : NULL, jamais un identifiant inventé.
        correlation_id: null,
        // #2440.6/.7/.8/.9/.16/.19 — le ledger porte désormais le détail LLM ;
        // un titre de fil n'en mesure aucun (pas de comptage de jetons ici),
        // donc chaque colonne reste NULL, jamais un 0 inventé.
        model: null,
        input_tokens: null,
        output_tokens: null,
        cache_read_tokens: null,
        cache_creation_tokens: null,
        status: null,
        tariff_version: null,
        // #2442.12 (lot M10) — a chat title is not a tool call: no tool name.
        tool: null,
      },
    ])
    expect(JSON.stringify(repo.insert.mock.calls)).not.toContain('SNCF')
    expect(JSON.stringify(repo.insert.mock.calls)).not.toContain('Réponse')
  })

  it('un modèle non tarifé s’enregistre « non mesuré » (null), jamais 0', async () => {
    const header = '[{"provider":"anthropic","operation":"bellum_chat_title","calls":1,"units":492,"cost_usd":null}]'
    const { controller, repo } = withCosts(header)

    await controller.createChatMessage(USER, assistantReply)
    await settle()

    expect(repo.insert).toHaveBeenCalledTimes(1)
    const [row] = repo.insert.mock.calls[0][0] as { cost_usd: string | null }[]
    expect(row.cost_usd).toBeNull()
    expect(row.cost_usd).not.toBe('0')
  })

  it('sait dire NON — sans en-tête (aucun appel de modèle, IA muette), aucune ligne n’est inventée', async () => {
    const { controller, repo, threadTitles } = withCosts(null)

    await controller.createChatMessage(USER, assistantReply)
    await settle()

    expect(threadTitles.titleAfterReply).toHaveBeenCalledTimes(1)
    expect(repo.insert).not.toHaveBeenCalled()
  })

  it('en démonstration, ni appel ni ligne de coût', async () => {
    const header = '[{"provider":"anthropic","operation":"bellum_chat_title","calls":1,"units":1,"cost_usd":0.1}]'
    const { controller, repo, threadTitles } = withCosts(header, true)

    await controller.createChatMessage(USER, assistantReply)
    await settle()

    expect(threadTitles.titleAfterReply).not.toHaveBeenCalled()
    expect(repo.insert).not.toHaveBeenCalled()
  })
})
