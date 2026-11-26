import type { ConfigService } from '@nestjs/config'
import { ProviderCostService } from '../analytics/provider-cost.service'
import { HttpError, TechnicalError } from '@bellum/errors'
import { BadRequestException, HttpException, Logger, ServiceUnavailableException } from '@nestjs/common'
import type { Response } from 'express'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { ChatStreamEvent, IaClient } from '../ia/ia.client'
import type { WorkspaceBrandService } from '../workspace/workspace-brand.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ChatContext, ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import { IaProxyController } from './ia-proxy.controller'
import type { ToolRegistryService } from '../tool-registry/tool-registry.service'
import { LAURA_REPLY_COST_CEILING_CREDITS, type ConnectedTool } from '@bellum/contracts'
import type { ConsultantsService } from '../consultants/consultants.service'
import type { OpenNeedsService } from '../projects/open-needs.service'
import type { ReplyFeedbackService } from '../account-feedback/reply-feedback.service'
import type { NotificationsService } from '../notifications/notifications.service'
import type {
  AssignPendingActionDto,
  BattlecardDto,
  ChatDto,
  CompareDto,
  CreateChatMessageDto,
  DiscoverDto,
  IcebreakerDto,
  ListChatHistoryDto,
  ListChatMessagesDto,
  GenerateMessageDto,
  SearchEntityExtractDto,
} from './dto/ia-proxy.dto'
import { generateMessageSchema } from './dto/ia-proxy.dto'

/**
 * `/ia/chat` diffuse en SSE (LOT STREAM, 12/09/2026) : `controller.chat`
 * prend maintenant un `@Res()` et ne rend plus l'enveloppe — cette suite
 * prouve le PROXY (quel corps part vers `IaClient.chatStream`), donc un
 * `Response` minimal (juste `write`/`end`/`setHeader`) suffit, et un flux à
 * un seul événement `done` reproduit exactement l'ancien comportement
 * bufferisé.
 */
function fakeRes(): Response {
  return {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  } as unknown as Response
}

/** Un flux `chatStream` à un seul événement terminal — la MÊME forme que
 *  l'ancienne `IaEnvelope` bufferisée. */
function chatStreamOf(envelope: { success: boolean; data: Record<string, unknown> }) {
  return jest.fn().mockImplementation(async function* (): AsyncGenerator<ChatStreamEvent> {
    yield { type: 'done', success: envelope.success, data: envelope.data }
  })
}

describe('IaProxyController', () => {
  const user = { userId: 'u-1' } as CurrentUserPayload
  const envelope = { success: true, data: { reply: 'Priorise EDF et SNCF.' } }

  // #3775.2b — `tools`, par défaut vide : les suites qui ne parlent pas des
  // sources restreintes gardent un registre sans connexion personnelle,
  // comportement byte-identique à avant ce point.
  function build(tools: ConnectedTool[] = []) {
    const ia = {
      discover: jest.fn().mockResolvedValue(envelope),
      chatStream: chatStreamOf(envelope),
      icebreaker: jest.fn().mockResolvedValue(envelope),
      weeklyBriefing: jest.fn().mockResolvedValue(envelope),
      battlecard: jest.fn().mockResolvedValue(envelope),
      compareAccounts: jest.fn().mockResolvedValue(envelope),
      generateMessage: jest.fn().mockResolvedValue(envelope),
      // #2810 — repli par défaut : aucun nom deviné tant qu'un test ne le stubbe pas.
      extractSearchEntity: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<
      Pick<
        IaClient,
        | 'discover'
        | 'chatStream'
        | 'icebreaker'
        | 'weeklyBriefing'
        | 'battlecard'
        | 'compareAccounts'
        | 'generateMessage'
        | 'extractSearchEntity'
      >
    >
    const chatMessages = {
      listThread: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'm-1' }),
      listHistory: jest.fn().mockResolvedValue([]),
      // #1911.15 — défaut : l'appelant ('u-1') EST l'auteur du fil, comme dans
      // tous les tests écrits avant cette permission. Un test qui veut le cas
      // « un autre a ouvert ce fil » écrase cette valeur explicitement.
      threadAuthor: jest.fn().mockResolvedValue('u-1'),
      deleteThread: jest.fn().mockResolvedValue(4),
    } as unknown as jest.Mocked<
      Pick<ChatMessagesService, 'listThread' | 'create' | 'listHistory' | 'threadAuthor' | 'deleteThread'>
    >
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      // #1942.2 / #1942.12 — un espace ORDINAIRE : le tour part. La salle de
      // démonstration, elle, refuse avant tout appel (`chat-demo-guard.spec.ts`).
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
      // #1911.15 — accords en propre, consultés seulement quand l'appelant
      // n'est pas l'auteur du fil. Défaut : aucun.
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Pick<WorkspaceContextService, 'resolveActiveWorkspace' | 'extraPermissionsOf'>>
    const esnProfile = {
      resolveProfileData: jest.fn().mockResolvedValue({ companyName: 'MonESN', size: '50', sectors: ['Banque'] }),
    } as unknown as jest.Mocked<Pick<EsnProfileReader, 'resolveProfileData'>>
    const chatCtx: ChatContext = {
      accountData: { id: 'a-1', company_name: 'SNCF' },
      contactsSummary: 'Jean - DSI - economic',
      planSummary: '{"strategy":"top-down"}',
      accountsSummary: null,
      profileData: { companyName: 'MonESN' },
      pinnedFacts: [{ fact: 'Budget IT voté en Q2', kind: 'fact', origin: 'manual' }],
      pinnedFactIds: ['f-1'],
      userPreferences: { tone: 'direct' },
      conversationSummary: '• Utilisateur : bonjour',
      crmConnected: false,
      crmProvider: null,
      crmPresence: null,
      accountFeedback: "- [play] « Play cyber » jugé INUTILE / hors sujet par l'utilisateur (2026-07-10)",
      toolsSummary: '- Dropcontact (connecté) : enrich_contact — coût : 1 crédit par enrichissement réussi',
      firstName: 'Théo',
      // TÉMOIN — aucun fuseau sur ce profil : le service IA garde son fuseau de
      // RÉFÉRENCE (Europe/Paris), et le corps envoyé reste byte-identique.
      timezone: null,
    }
    const chatContext = {
      build: jest.fn().mockResolvedValue(chatCtx),
      recordConversationTurn: jest.fn().mockResolvedValue(undefined),
      // #1927.10 — le VRAI ChatContextService répond toujours ; un double qui
      // n'a pas cette méthode fait échouer silencieusement chaque suppression
      // de fil (l'appelant l'avale et journalise une erreur). Défaut mesuré
      // vague 11 (21/09/2026) : les tests qui veulent l'échec le stubbent en
      // PROPRE (`Object.assign(chatContext, { forgetConversation: ... })`).
      forgetConversation: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<Pick<ChatContextService, 'build' | 'recordConversationTurn' | 'forgetConversation'>>
    const portfolio = {
      resolve: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Pick<DiscoverPortfolioService, 'resolve'>>
    const toolRegistry = { list: jest.fn().mockResolvedValue(tools) } as unknown as jest.Mocked<
      Pick<ToolRegistryService, 'list'>
    >
    return {
      ia,
      chatMessages,
      workspaceContext,
      esnProfile,
      chatContext,
      portfolio,
      toolRegistry,
      controller: new IaProxyController(
        ia as unknown as IaClient,
        chatMessages as unknown as ChatMessagesService,
        workspaceContext as unknown as WorkspaceContextService,
        esnProfile as unknown as EsnProfileReader,
        chatContext as unknown as ChatContextService,
        portfolio as unknown as DiscoverPortfolioService,
        // Plafond copilote désactivé dans ces suites : elles prouvent le proxy,
        // pas la borne (couverte par `chat-daily-quota.spec.ts`).
        { get: () => 0 } as unknown as ConfigService,
        toolRegistry as unknown as ToolRegistryService,
        // #1954 — obligatoire. Un fil VIVANT se transmet tel quel ; la branche
        // « fil rangé » (aucun fil transmis) a sa suite, `ia-proxy.thread-documents.spec.ts`.
        {
          readableThread: jest.fn(
            async (target: { conversationId: string | null }) => target.conversationId ?? undefined,
          ),
          // #1954 × #1927.10 — supprimer un fil supprime d'abord ses documents
          // « fil seul » ; l'ordre et l'échec ont leur suite
          // (`ia-proxy.thread-documents.spec.ts`), ici on prouve la mémoire du fil.
          deleteForThread: jest.fn().mockResolvedValue(0),
        } as unknown as ChatThreadDocumentsService,
      ),
    }
  }

  // #2123.61-.68 — les paramètres choisis dans le composer traversent le proxy ;
  // sans eux, la clé n'existe pas et le corps envoyé au moteur est celui d'avant.
  it('#2123.61-.68 — forwards the chosen message parameters, and omits the key when none', async () => {
    const { ia, controller } = build()
    const contactId = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'
    await controller.generateMessage(user, {
      contactId,
      channel: 'email',
      parameters: { objective: 'relance', proof: 'REX assureur' },
    } as GenerateMessageDto)
    expect(ia.generateMessage.mock.calls[0]?.[0]).toMatchObject({
      contactId,
      parameters: { objective: 'relance', proof: 'REX assureur' },
    })

    await controller.generateMessage(user, { contactId, channel: 'email' } as GenerateMessageDto)
    expect(ia.generateMessage.mock.calls[1]?.[0]).not.toHaveProperty('parameters')
  })

  // #3419.3 — la consigne « accroche alternative » traverse le proxy jusqu'au moteur ; sans elle, la clé n'existe pas.
  it('#3419.3 — forwards the alternative-hook revision, and omits the key when none', async () => {
    const { ia, controller } = build()
    const contactId = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'
    const revision = {
      kind: 'alternative_hook',
      currentBody: 'Bonjour,\n\nVotre levée.',
      previousHooks: ['Votre levée.'],
    }
    await controller.generateMessage(user, { contactId, channel: 'email', revision } as GenerateMessageDto)
    expect(ia.generateMessage.mock.calls[0]?.[0]).toMatchObject({ contactId, revision })

    await controller.generateMessage(user, { contactId, channel: 'email' } as GenerateMessageDto)
    expect(ia.generateMessage.mock.calls[1]?.[0]).not.toHaveProperty('revision')
  })

  // #4524.2 — « Sur quoi Laura s'appuie » : les faits cochés traversent le proxy jusqu'au moteur ; sans choix, la clé n'existe pas.
  it('#4524.2 — forwards the chosen grounding, and omits the key when none', async () => {
    const { ia, controller } = build()
    const contactId = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'
    const grounding = { mode: 'facts', facts: [{ kind: 'account_signal', label: 'Cession', proof: 'Les Echos' }] }
    await controller.generateMessage(user, { contactId, channel: 'email', grounding } as GenerateMessageDto)
    expect(ia.generateMessage.mock.calls[0]?.[0]).toMatchObject({ contactId, grounding })

    await controller.generateMessage(user, { contactId, channel: 'email' } as GenerateMessageDto)
    expect(ia.generateMessage.mock.calls[1]?.[0]).not.toHaveProperty('grounding')
  })

  it('#4524.2 — the DTO accepts the grounding contract and refuses a free angle that imposes facts', () => {
    const contactId = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'
    const parse = (grounding: Record<string, unknown>) =>
      generateMessageSchema.safeParse({ contactId, channel: 'email', grounding })
    expect(parse({ mode: 'free_angle' }).success).toBe(true)
    expect(parse({ mode: 'facts', facts: [{ kind: 'contact_need', label: 'x' }] }).success).toBe(true)
    expect(parse({ mode: 'facts', facts: [] }).success).toBe(false)
    expect(parse({ mode: 'free_angle', facts: [{ kind: 'contact_need', label: 'x' }] }).success).toBe(false)
  })

  it('#3419.3 — the DTO accepts only the alternative_hook revision, bounded', () => {
    const contactId = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'
    const parse = (revision: Record<string, unknown>) =>
      generateMessageSchema.safeParse({ contactId, channel: 'email', revision })
    expect(parse({ kind: 'alternative_hook', currentBody: 'Bonjour' }).success).toBe(true)
    expect(parse({ kind: 'rewrite_all', currentBody: 'Bonjour' }).success).toBe(false)
    expect(parse({ kind: 'alternative_hook', currentBody: '' }).success).toBe(false)
    expect(parse({ kind: 'alternative_hook', currentBody: 'x'.repeat(4001) }).success).toBe(false)
    expect(parse({ kind: 'alternative_hook', currentBody: 'b', previousHooks: Array(6).fill('h') }).success).toBe(false)
  })

  // #3405.3 — la garde NO-GO sur l'endpoint de brouillon : même règle que le routeur d'actions.
  it('#3405.3 — refuses a draft for a contact whose account is NO-GO, before any model call', async () => {
    const { ia, controller } = build()
    const refusal = 'Ce compte est en NO-GO (budget gelé) : pas de relance sans nouveau motif.'
    const messageRefusalForContact = jest.fn().mockResolvedValue(refusal)
    Object.assign(controller, { accountsService: { messageRefusalForContact } })
    const contactId = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'
    await expect(
      controller.generateMessage(user, { contactId, channel: 'email' } as GenerateMessageDto),
    ).rejects.toMatchObject({
      status: 409,
    })
    expect(messageRefusalForContact).toHaveBeenCalledWith(contactId, 'ws-1')
    expect(ia.generateMessage).not.toHaveBeenCalled()
  })

  it('#3405.3 — lets the draft through when the account is not NO-GO (witness)', async () => {
    const { ia, controller } = build()
    Object.assign(controller, { accountsService: { messageRefusalForContact: jest.fn().mockResolvedValue(null) } })
    const contactId = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'
    await controller.generateMessage(user, { contactId, channel: 'email' } as GenerateMessageDto)
    expect(ia.generateMessage).toHaveBeenCalledTimes(1)
  })

  it('#2123.61-.68 — the DTO refuses an unknown parameter key and an oversized text', () => {
    const contactId = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'
    expect(generateMessageSchema.safeParse({ contactId, channel: 'email', parameters: { tone: 'x' } }).success).toBe(
      false,
    )
    expect(
      generateMessageSchema.safeParse({ contactId, channel: 'email', parameters: { signal: 'x'.repeat(301) } }).success,
    ).toBe(false)
    expect(
      generateMessageSchema.safeParse({ contactId, channel: 'email', parameters: { objective: 'relance' } }).success,
    ).toBe(true)
  })

  it('#2204.7/.15 — the DTO carries the scope (160) and the constraints (300), bounded like the other texts', () => {
    const contactId = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'
    const parse = (parameters: Record<string, string>) =>
      generateMessageSchema.safeParse({ contactId, channel: 'email', parameters })
    expect(parse({ scope: 'DSI groupe', constraints: '80 mots au plus' }).success).toBe(true)
    expect(parse({ scope: 'x'.repeat(161) }).success).toBe(false)
    expect(parse({ constraints: 'x'.repeat(301) }).success).toBe(false)
    // La même clé inconnue reste refusée : `.strict()` n'a pas été desserré.
    expect(parse({ tone: 'x' }).success).toBe(false)
  })

  // #3418 (recette prod 02/10) — « La génération du message a échoué » ×2 : le champ « Problème à adresser »
  // (#3418.8) existe côté web et côté moteur, mais le DTO `.strict()` du proxy ne le connaissait pas → 400.
  it('#3418 — the DTO accepts the problem to address (300) and every key the composer can send', () => {
    const contactId = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'
    const parse = (parameters: Record<string, string>) =>
      generateMessageSchema.safeParse({ contactId, channel: 'email', parameters })
    expect(parse({ problem: 'Renouvellement du TMA en retard' }).success).toBe(true)
    expect(parse({ problem: 'x'.repeat(301) }).success).toBe(false)
    expect(
      parse({
        objective: 'relance',
        relationship: 'froide',
        persona: 'dsi',
        signal: 's',
        offer: 'o',
        proof: 'p',
        cta: 'appel',
        scope: 'sc',
        problem: 'pb',
        constraints: 'c',
      }).success,
    ).toBe(true)
  })

  it('#2123.72 — the DTO accepts the fourth channel (contact task) and still refuses an unknown one', () => {
    const contactId = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'
    expect(generateMessageSchema.safeParse({ contactId, channel: 'task' }).success).toBe(true)
    // #2370 (V10-F) — `sms` est devenu un canal réel ; l'inconnu se teste sur un canal qui n'existe pas.
    expect(generateMessageSchema.safeParse({ contactId, channel: 'fax' }).success).toBe(false)
  })

  // #2204.59-.65 (épopée #2947) — la génération RÉELLE lit désormais le style
  // choisi, pas seulement l'aperçu comparatif (#2369.11). `messageStyle` est
  // le TOUT DERNIER paramètre `@Optional()` du contrôleur : assigné en direct
  // (privé en TypeScript seulement, pas au runtime), même patron que
  // `discover-proxy.controller.spec.ts` pour `discoverMarketMemory`.
  describe('#2204.59-.65 — le style choisi atteint la génération RÉELLE', () => {
    const contactId = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'
    const styleId = '99999999-9999-4999-8999-999999999999'
    const activeTemplate = {
      id: styleId,
      workspaceId: 'ws-1',
      ownerId: 'u-1',
      objective: 'Relancer un décideur silencieux',
      channel: 'email',
      persona: 'DSI',
      status: 'active',
      forbidden: ['spam', 'urgent'],
      version: 3,
      scope: 'workspace',
      businessUnitId: null,
      conversationId: null,
      createdAt: '2026-09-25T10:00:00.000Z',
      updatedAt: '2026-09-25T10:00:00.000Z',
    }

    function buildWithStyle(messageStyle: {
      resolveActiveTemplateForGeneration: jest.Mock
      resolveByScope?: jest.Mock
    }) {
      const base = build()
      ;(base.controller as unknown as { messageStyle: unknown }).messageStyle = messageStyle
      return base
    }

    it('résout le style ACTIVE de cet espace et l’ajoute au `context`', async () => {
      const messageStyle = { resolveActiveTemplateForGeneration: jest.fn().mockResolvedValue(activeTemplate) }
      const { ia, controller } = buildWithStyle(messageStyle)
      await controller.generateMessage(user, {
        contactId,
        channel: 'email',
        context: 'Vient de lever une série B',
        messageStyleTemplateId: styleId,
      } as GenerateMessageDto)
      expect(messageStyle.resolveActiveTemplateForGeneration).toHaveBeenCalledWith(
        { userId: 'u-1', workspaceId: 'ws-1', role: 'owner' },
        styleId,
      )
      expect(ia.generateMessage.mock.calls[0]?.[0]).toMatchObject({
        context: expect.stringContaining('Vient de lever une série B'),
      })
      const forwardedContext = (ia.generateMessage.mock.calls[0]?.[0] as { context: string }).context
      expect(forwardedContext).toContain('spam')
      expect(forwardedContext).toContain('urgent')
    })

    // #2204.65 — sans style choisi MAIS avec un objectif, le style actif le plus proche de la situation s'applique.
    it('#2204.65 — sans `messageStyleTemplateId` et avec un objectif : la résolution par portée s’applique', async () => {
      const messageStyle = {
        resolveActiveTemplateForGeneration: jest.fn(),
        resolveByScope: jest.fn().mockResolvedValue(activeTemplate),
      }
      const { ia, controller } = buildWithStyle(messageStyle as never)
      await controller.generateMessage(user, {
        contactId,
        channel: 'email',
        context: 'Angle',
        parameters: { objective: 'first_contact', persona: 'dsi' },
      } as GenerateMessageDto)
      expect(messageStyle.resolveByScope).toHaveBeenCalledWith(
        { userId: 'u-1', workspaceId: 'ws-1', role: 'owner' },
        // #2204.65 — le fil du composer est celui du contact, recomposé ICI (jamais envoyé par le navigateur).
        { objective: 'first_contact', channel: 'email', persona: 'dsi', conversationId: `contact:${contactId}` },
      )
      expect(messageStyle.resolveActiveTemplateForGeneration).not.toHaveBeenCalled()
      expect((ia.generateMessage.mock.calls[0]?.[0] as { context: string }).context).toContain('spam')
    })

    // #2204.65 — ÉQUIPE : le périmètre demandé doit être un de ceux que l'APPELANT porte, sinon il est ignoré.
    describe('#2204.65 — la portée ÉQUIPE atteint la génération du composer', () => {
      const unitA = '11111111-1111-4111-8111-111111111111'
      const unitB = '22222222-2222-4222-8222-222222222222'

      function buildWithUnits(perimeters: string[]) {
        const messageStyle = {
          resolveActiveTemplateForGeneration: jest.fn(),
          resolveByScope: jest.fn().mockResolvedValue(activeTemplate),
        }
        const base = buildWithStyle(messageStyle as never)
        ;(base.controller as unknown as { businessUnits: unknown }).businessUnits = {
          perimetersOf: jest.fn().mockResolvedValue(perimeters),
        }
        return { ...base, messageStyle }
      }

      it('un périmètre PORTÉ par l’appelant est transmis à la résolution', async () => {
        const { controller, messageStyle } = buildWithUnits([unitA, unitB])
        await controller.generateMessage(user, {
          contactId,
          channel: 'email',
          businessUnitId: unitB,
          parameters: { objective: 'first_contact' },
        } as GenerateMessageDto)
        expect(messageStyle.resolveByScope.mock.calls[0]?.[1]).toMatchObject({ businessUnitId: unitB })
      })

      it('⚠️ SAIT DIRE NON — le périmètre d’une autre équipe n’est jamais transmis (aucune fuite de style)', async () => {
        const { controller, messageStyle } = buildWithUnits([unitA])
        await controller.generateMessage(user, {
          contactId,
          channel: 'email',
          businessUnitId: unitB,
          parameters: { objective: 'first_contact' },
        } as GenerateMessageDto)
        const target = messageStyle.resolveByScope.mock.calls[0]?.[1] as Record<string, unknown>
        expect(target).not.toHaveProperty('businessUnitId')
      })

      it('sans périmètre demandé, une personne qui n’en porte QU’UN applique celui-là', async () => {
        const { controller, messageStyle } = buildWithUnits([unitA])
        await controller.generateMessage(user, {
          contactId,
          channel: 'email',
          parameters: { objective: 'first_contact' },
        } as GenerateMessageDto)
        expect(messageStyle.resolveByScope.mock.calls[0]?.[1]).toMatchObject({ businessUnitId: unitA })
      })

      it('sans périmètre demandé et avec plusieurs : rien n’est deviné', async () => {
        const { controller, messageStyle } = buildWithUnits([unitA, unitB])
        await controller.generateMessage(user, {
          contactId,
          channel: 'email',
          parameters: { objective: 'first_contact' },
        } as GenerateMessageDto)
        expect(messageStyle.resolveByScope.mock.calls[0]?.[1]).not.toHaveProperty('businessUnitId')
      })

      it('le DTO accepte `businessUnitId` (uuid) et refuse un identifiant qui n’en est pas un', () => {
        expect(generateMessageSchema.safeParse({ contactId, channel: 'email', businessUnitId: unitA }).success).toBe(
          true,
        )
        expect(generateMessageSchema.safeParse({ contactId, channel: 'email', businessUnitId: 'abc' }).success).toBe(
          false,
        )
      })
    })

    it('#2204.65 — `messageStyleTemplateId: null` (« aucun style ») désactive la résolution par portée', async () => {
      const messageStyle = { resolveActiveTemplateForGeneration: jest.fn(), resolveByScope: jest.fn() }
      const { controller } = buildWithStyle(messageStyle as never)
      await controller.generateMessage(user, {
        contactId,
        channel: 'email',
        messageStyleTemplateId: null,
        parameters: { objective: 'first_contact' },
      } as GenerateMessageDto)
      expect(messageStyle.resolveByScope).not.toHaveBeenCalled()
    })

    it('sans `messageStyleTemplateId`, le corps envoyé au moteur reste celui d’avant', async () => {
      const messageStyle = { resolveActiveTemplateForGeneration: jest.fn() }
      const { ia, controller } = buildWithStyle(messageStyle)
      await controller.generateMessage(user, {
        contactId,
        channel: 'email',
        context: 'Angle sans style',
      } as GenerateMessageDto)
      expect(messageStyle.resolveActiveTemplateForGeneration).not.toHaveBeenCalled()
      expect(ia.generateMessage.mock.calls[0]?.[0]).toMatchObject({ context: 'Angle sans style' })
    })

    it('un style introuvable/pas actif échoue clairement — jamais deviné appliqué', async () => {
      const messageStyle = {
        resolveActiveTemplateForGeneration: jest.fn().mockRejectedValue(new BadRequestException('nope')),
      }
      const { controller } = buildWithStyle(messageStyle)
      await expect(
        controller.generateMessage(user, {
          contactId,
          channel: 'email',
          messageStyleTemplateId: styleId,
        } as GenerateMessageDto),
      ).rejects.toThrow(BadRequestException)
    })

    it('un identifiant fourni sans module de style monté échoue — jamais silencieusement ignoré', async () => {
      const { controller } = build()
      await expect(
        controller.generateMessage(user, {
          contactId,
          channel: 'email',
          messageStyleTemplateId: styleId,
        } as GenerateMessageDto),
      ).rejects.toThrow(ServiceUnavailableException)
    })
  })

  it('resolves the discover profile SERVER-SIDE from the JWT, ignoring the body', async () => {
    const { ia, esnProfile, controller } = build()
    await controller.discover(user, { criteria: 'ESN Paris' } as DiscoverDto)
    expect(esnProfile.resolveProfileData).toHaveBeenCalledWith('u-1')
    // Discover is a single Brave+Claude call: the proxy forwards a no-retry,
    // longer-deadline option so a slower run isn't clipped or triple-billed.
    expect(ia.discover).toHaveBeenCalledWith(
      { criteria: 'ESN Paris', profileData: { companyName: 'MonESN', size: '50', sectors: ['Banque'] } },
      { maxAttempts: 1, timeoutMs: 45_000 },
    )
  })

  it('chat resolves the full context SERVER-SIDE and forwards it (body carries only intent)', async () => {
    const { ia, chatContext, workspaceContext, controller } = build()
    // A malicious body could try to smuggle a user_id / fake context; the DTO has
    // neither, and the controller assembles account/contacts/plan/profile itself.
    await controller.chat(user, { message: 'hi', accountId: 'a-1', conversationId: 'general' } as ChatDto, fakeRes())
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(chatContext.build).toHaveBeenCalledWith({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: 'a-1',
      // #3772.5 — sans demande explicite, jamais d'exclusion.
      excludeWorkspaceData: false,
      conversationId: 'general',
      // #2430.2 — sans l'objet conversation monté, aucun fil d'origine.
      parentConversationId: null,
      // The message text is forwarded so the shared thread can resolve an account named in it.
      message: 'hi',
      // #2428.12 — sans mention choisie dans ce corps de test, la clé reste
      // `null` : le serveur retombe sur l'heuristique par prénom.
      mentionedUserId: null,
      // #1581.1 — sans le module de mémoire marché monté, la lecture rend `null`
      // et le bloc n'apparaît PAS dans le contexte. « Je n'ai pas lu » n'est
      // jamais « il n'y a rien », et surtout jamais « 0 couvert sur 0 ».
      marketPortfolio: null,
      // #1918.2 — sans `BusinessUnitService` (ce contrôleur est construit par
      // position), l'appelant ne porte AUCUN périmètre : aucune mémoire
      // d'équipe n'entre dans le prompt. Repli FERMÉ.
      businessUnitIds: [],
      // #2259.30-.35 — même repli FERMÉ, même raison : sans `BusinessUnitService`
      // monté, aucune fiche de BU n'entre dans le contexte de Laura.
      businessUnitDetails: [],
      // #2259.4 / #2259.13 — déjà résolu par `resolveActiveWorkspace`
      // (mocké `owner` ci-dessus), simplement PORTÉ.
      role: 'owner',
    })
    expect(ia.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        message: 'hi',
        accountId: 'a-1',
        contactsSummary: 'Jean - DSI - economic',
        profileData: { companyName: 'MonESN' },
      }),
      // 2e argument : lecture de l'en-tête de coûts (D19), hors sujet ici.
      expect.anything(),
    )
  })

  // #2428.12 — un `mentionedUserId` du corps de requête est PORTÉ jusqu'au
  // contexte, jamais recalculé ni ignoré par ce contrôleur (GA-07 : la
  // résolution elle-même vit dans `ChatContextService`).
  it('chat porte `mentionedUserId` du corps de requête jusqu’au contexte', async () => {
    const { chatContext, controller } = build()
    await controller.chat(
      user,
      { message: 'hi', accountId: 'a-1', conversationId: 'general', mentionedUserId: 'u-2' } as ChatDto,
      fakeRes(),
    )
    expect(chatContext.build).toHaveBeenCalledWith(expect.objectContaining({ mentionedUserId: 'u-2' }))
  })

  // #2257.1 — le contrat de demande structuré : construit UNE FOIS par tour
  // depuis ce que ce contrôleur a déjà résolu, journalisé SANS le contenu.
  it('chat journalise le contrat de demande structuré SANS le nom du compte — seulement sa présence', async () => {
    const { controller } = build()
    const logSpy = jest.spyOn(controller['logger'], 'log')
    await controller.chat(user, { message: 'hi', accountId: 'a-1', conversationId: 'general' } as ChatDto, fakeRes())
    const call = logSpy.mock.calls.find(args => args[0] === 'Contrat de demande structuré (#2257.1)')
    expect(call).toBeDefined()
    const meta = call?.[1] as { tags: Record<string, unknown> }
    expect(meta.tags['has_objet_depart']).toBe(true)
    expect(meta.tags['ambiguite_deja_demandee']).toBe(false)
    // Les champs sans producteur restent nommés `false` — jamais un booléen
    // deviné à `true`, et surtout jamais la valeur elle-même dans le journal.
    expect(meta.tags['has_intention_principale']).toBe(false)
    expect(JSON.stringify(meta)).not.toContain('SNCF')
  })

  it('chat marque ambiguite_deja_demandee depuis le drapeau client, sans deviner du texte', async () => {
    const { controller } = build()
    const logSpy = jest.spyOn(controller['logger'], 'log')
    await controller.chat(
      user,
      { message: 'hi', accountId: 'a-1', conversationId: 'general', clarificationAsked: true } as ChatDto,
      fakeRes(),
    )
    const call = logSpy.mock.calls.find(args => args[0] === 'Contrat de demande structuré (#2257.1)')
    const meta = call?.[1] as { tags: Record<string, unknown> }
    expect(meta.tags['ambiguite_deja_demandee']).toBe(true)
  })

  it("chat garde la lecture de l'en-tête de coûts (D19)", async () => {
    const { ia, controller } = build()
    await controller.chat(user, { message: 'hi', accountId: 'a-1', conversationId: 'general' } as ChatDto, fakeRes())
    expect(ia.chatStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        responseHeaderName: expect.any(String),
        onResponseHeader: expect.any(Function),
      }),
    )
  })

  // #1960.20 — décision de Louis du 13/09/2026 : en marque blanche, Laura ne
  // donne AUCUNE adresse Bellum. La marque se lit ICI, côté serveur, jamais
  // dans le corps envoyé par le navigateur.
  it('#1960.20 — chat tells the IA when the workspace is white-label', async () => {
    const { ia, chatMessages, workspaceContext, esnProfile, chatContext, portfolio } = build()
    const brands = { getForWorkspace: jest.fn().mockResolvedValue({ isCustom: true }) }
    const controller = new IaProxyController(
      ia as unknown as IaClient,
      chatMessages as unknown as ChatMessagesService,
      workspaceContext as unknown as WorkspaceContextService,
      esnProfile as unknown as EsnProfileReader,
      chatContext as unknown as ChatContextService,
      portfolio as unknown as DiscoverPortfolioService,
      { get: () => 0 } as unknown as ConfigService,
      { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
      // #1954 — `threadDocuments`, OBLIGATOIRE et avant les `@Optional()` (lot 2b).
      {
        readableThread: jest.fn(
          async (target: { conversationId: string | null }) => target.conversationId ?? undefined,
        ),
      } as unknown as ChatThreadDocumentsService,
      undefined,
      undefined,
      undefined,
      // `threadTitles` (#1911.1) occupe la place d'avant : la marque vient après.
      undefined,
      brands as unknown as WorkspaceBrandService,
    )

    await controller.chat(
      user,
      { message: 'humain ?', accountId: 'a-1', conversationId: 'general' } as ChatDto,
      fakeRes(),
    )

    expect(brands.getForWorkspace).toHaveBeenCalledWith('ws-1')
    expect(ia.chatStream).toHaveBeenCalledWith(expect.objectContaining({ whiteLabel: true }), expect.anything())
  })

  it('#1960.20 — témoin : sans service de marque, l’espace n’est pas en marque blanche', async () => {
    const { ia, controller } = build()
    await controller.chat(
      user,
      { message: 'humain ?', accountId: 'a-1', conversationId: 'general' } as ChatDto,
      fakeRes(),
    )
    expect(ia.chatStream).toHaveBeenCalledWith(expect.objectContaining({ whiteLabel: false }), expect.anything())
  })

  it('chat forwards the long-memory context to the IA (Théo P2)', async () => {
    const { ia, controller } = build()
    await controller.chat(user, { message: 'hi', accountId: 'a-1', conversationId: 'general' } as ChatDto, fakeRes())
    expect(ia.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        pinnedFacts: [{ fact: 'Budget IT voté en Q2', kind: 'fact', origin: 'manual' }],
        userPreferences: { tone: 'direct' },
        conversationSummary: '• Utilisateur : bonjour',
      }),
      // 2e argument : lecture de l'en-tête de coûts (D19), hors sujet ici.
      expect.anything(),
    )
  })

  it('chat forwards the account-feedback correction memory to the IA (A2)', async () => {
    const { ia, controller } = build()
    await controller.chat(user, { message: 'hi', accountId: 'a-1', conversationId: 'general' } as ChatDto, fakeRes())
    expect(ia.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        accountFeedback: expect.stringContaining('jugé INUTILE'),
      }),
      // 2e argument : lecture de l'en-tête de coûts (D19), hors sujet ici.
      expect.anything(),
    )
  })

  it('#1919.15 — chat forwards the reply-feedback memory of THIS person, read by the controller', async () => {
    const { ia, chatMessages, workspaceContext, esnProfile, chatContext, portfolio } = build()
    const replyFeedback = {
      memoryFor: jest.fn().mockResolvedValue('- (2026-09-12) Ta réponse … jugée PAS PERTINENTE'),
    }
    const controller = new IaProxyController(
      ia as unknown as IaClient,
      chatMessages as unknown as ChatMessagesService,
      workspaceContext as unknown as WorkspaceContextService,
      esnProfile as unknown as EsnProfileReader,
      chatContext as unknown as ChatContextService,
      portfolio as unknown as DiscoverPortfolioService,
      { get: () => 0 } as unknown as ConfigService,
      { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
      // #1954 — `threadDocuments`, OBLIGATOIRE et en 9e position, avant les `@Optional()`.
      {
        readableThread: jest.fn(
          async (target: { conversationId: string | null }) => target.conversationId ?? undefined,
        ),
      } as unknown as ChatThreadDocumentsService,
      undefined,
      undefined,
      undefined,
      // `threadTitles` (#1911), `brands` (#1960.20), `cards` (#1943 L3),
      // `consultants` / `openNeeds` (#1951.2), `planFeatures` (#1957) puis
      // `replyMemoryUses` (#1916.24) — `replyFeedback` vient EN DERNIER, en 20e
      // position dans le constructeur fusionné du 13/09.
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      replyFeedback as unknown as ReplyFeedbackService,
    )
    await controller.chat(user, { message: 'hi', accountId: 'a-1', conversationId: 'general' } as ChatDto, fakeRes())
    expect(replyFeedback.memoryFor).toHaveBeenCalledWith({ workspaceId: 'ws-1', userId: 'u-1' })
    expect(ia.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({ replyFeedback: expect.stringContaining('PAS PERTINENTE') }),
      expect.anything(),
    )
  })

  it('#1919.15 — without the reply-feedback module mounted, nothing is forwarded (prompt unchanged)', async () => {
    const { ia, controller } = build()
    await controller.chat(user, { message: 'hi', accountId: 'a-1', conversationId: 'general' } as ChatDto, fakeRes())
    const input = ia.chatStream.mock.calls[0]?.[0] as { replyFeedback?: string | null }
    expect(input.replyFeedback ?? null).toBeNull()
  })

  it('chat forwards the real CRM connection state to the IA (transparency)', async () => {
    const { ia, controller } = build()
    await controller.chat(user, { message: 'hi', accountId: 'a-1', conversationId: 'general' } as ChatDto, fakeRes())
    expect(ia.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({ crmConnected: false, crmProvider: null, crmPresence: null }),
      expect.anything(),
    )
  })

  it('chat forwards the connected-tools digest to the IA (Tool Registry v2)', async () => {
    const { ia, controller } = build()
    await controller.chat(user, { message: 'hi', accountId: 'a-1', conversationId: 'general' } as ChatDto, fakeRes())
    expect(ia.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        toolsSummary: expect.stringContaining('Dropcontact'),
      }),
      // 2e argument : lecture de l'en-tête de coûts (D19), hors sujet ici.
      expect.anything(),
    )
    expect(ia.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        toolsSummary: expect.stringContaining('1 crédit'),
      }),
      // 2e argument : lecture de l'en-tête de coûts (D19), hors sujet ici.
      expect.anything(),
    )
  })

  // #1951.2 / #1951.3 — la portée « un consultant » / « un besoin ». Le
  // navigateur DÉSIGNE (nature + identifiant) ; le contrôleur relit la fiche
  // dans l'espace actif, et c'est son RENDU qui part au service IA.
  describe('#1951 — la fiche du périmètre choisi est relue côté serveur', () => {
    const consultantId = '6f1c1b1e-8a51-4c2f-9d1e-2b9d0c7a4e11'
    const needId = '0b8a1d52-7a52-4f6b-8a7e-3c9d2e1f4a10'

    function buildWithScopeReaders(found: { consultant?: unknown; need?: unknown }) {
      const base = build()
      const consultants = { findOneScoped: jest.fn().mockResolvedValue(found.consultant ?? null) }
      const openNeeds = { list: jest.fn().mockResolvedValue({ data: found.need ? [found.need] : [] }) }
      const controller = new IaProxyController(
        base.ia as unknown as IaClient,
        base.chatMessages as unknown as ChatMessagesService,
        base.workspaceContext as unknown as WorkspaceContextService,
        base.esnProfile as unknown as EsnProfileReader,
        base.chatContext as unknown as ChatContextService,
        base.portfolio as unknown as DiscoverPortfolioService,
        { get: () => 0 } as unknown as ConfigService,
        { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
        // #1954 — `threadDocuments`, OBLIGATOIRE et avant les `@Optional()` : ce
        // bloc mesure la portée objet, pas les documents du fil.
        { readableThread: jest.fn().mockResolvedValue(undefined) } as unknown as ChatThreadDocumentsService,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        // `cards` (#1943 L3) s'intercale ICI dans le constructeur fusionné :
        // sans cette place, la portée objet atterrissait dans l'emplacement
        // des cartes de Laura.
        undefined,
        consultants as unknown as ConsultantsService,
        openNeeds as unknown as OpenNeedsService,
      )
      return { ...base, controller, consultants, openNeeds }
    }

    it('un consultant : relu dans l’espace de l’appelant, et sa fiche part au service IA', async () => {
      const { ia, consultants, controller } = buildWithScopeReaders({
        consultant: { full_name: 'Sophie Martin', title: 'Consultante Java', stack: ['Java'], sectors: [], zones: [] },
      })
      await controller.chat(
        user,
        { message: 'Où la positionner ?', scopeObject: { kind: 'consultant', id: consultantId } } as ChatDto,
        fakeRes(),
      )
      expect(consultants.findOneScoped).toHaveBeenCalledWith(consultantId, 'ws-1', 'u-1')
      expect(ia.chatStream).toHaveBeenCalledWith(
        expect.objectContaining({ scopeObject: expect.stringContaining('Sophie Martin') }),
        expect.anything(),
      )
    })

    it('un besoin : relu par la MÊME lecture que sa fiche, bornée à l’espace', async () => {
      const { ia, openNeeds, controller } = buildWithScopeReaders({
        need: { title: 'Data engineer', account_name: 'SNCF', skills: [], shortlist_count: 1, headcount: 1 },
      })
      await controller.chat(
        user,
        { message: 'Qui pousser ?', scopeObject: { kind: 'need', id: needId } } as ChatDto,
        fakeRes(),
      )
      expect(openNeeds.list).toHaveBeenCalledWith('ws-1', { id: needId, offset: 0, limit: 1 })
      expect(ia.chatStream).toHaveBeenCalledWith(
        expect.objectContaining({ scopeObject: expect.stringContaining('Data engineer') }),
        expect.anything(),
      )
    })

    it('une fiche hors de l’espace : Laura reçoit « introuvable », jamais le portefeuille en silence', async () => {
      const { ia, controller } = buildWithScopeReaders({})
      await controller.chat(
        user,
        { message: 'Et elle ?', scopeObject: { kind: 'consultant', id: consultantId } } as ChatDto,
        fakeRes(),
      )
      expect(ia.chatStream).toHaveBeenCalledWith(
        expect.objectContaining({ scopeObject: expect.stringContaining('introuvable') }),
        expect.anything(),
      )
    })

    it('sans lecteur monté, le périmètre demandé se dit illisible — pas un fil sans cadre', async () => {
      const { ia, controller } = build()
      await controller.chat(
        user,
        { message: 'Et elle ?', scopeObject: { kind: 'consultant', id: consultantId } } as ChatDto,
        fakeRes(),
      )
      expect(ia.chatStream).toHaveBeenCalledWith(
        expect.objectContaining({ scopeObject: expect.stringContaining('illisible') }),
        expect.anything(),
      )
    })

    // Théo L1 — sélecteur avancé — une offre d'emploi : la ligne d'historique de
    // recrutement relue DANS l'espace de l'appelant, avec son compte.
    it('une offre d’emploi : relue dans l’espace de l’appelant, avec son compte (Théo L1)', async () => {
      const { ia, controller } = build()
      const signalHistory = {
        readJobOffer: jest.fn().mockResolvedValue({
          label: 'Architecte cloud — Saint-Denis',
          signal_key: 'architecte cloud — saint-denis',
          signal_date: '2026-10-02',
          status: 'active',
          resolved_at: null,
          company_name: 'SNCF Voyageurs',
          website: null,
          recent_signals: [],
          job_signals: [],
        }),
      }
      ;(controller as unknown as Record<string, unknown>).signalHistory = signalHistory
      await controller.chat(
        user,
        { message: 'Comment l’approcher ?', scopeObject: { kind: 'job_offer', id: consultantId } } as ChatDto,
        fakeRes(),
      )
      expect(signalHistory.readJobOffer).toHaveBeenCalledWith(consultantId, 'ws-1')
      expect(ia.chatStream).toHaveBeenCalledWith(
        expect.objectContaining({ scopeObject: expect.stringContaining('Architecte cloud — Saint-Denis') }),
        expect.anything(),
      )
      expect(ia.chatStream).toHaveBeenCalledWith(
        expect.objectContaining({ scopeObject: expect.stringContaining('SNCF Voyageurs') }),
        expect.anything(),
      )
    })

    it('une offre d’emploi hors de l’espace : « introuvable », jamais celle d’un autre client (Théo L1)', async () => {
      const { ia, controller } = build()
      ;(controller as unknown as Record<string, unknown>).signalHistory = {
        readJobOffer: jest.fn().mockResolvedValue(null),
      }
      await controller.chat(
        user,
        { message: 'Et elle ?', scopeObject: { kind: 'job_offer', id: consultantId } } as ChatDto,
        fakeRes(),
      )
      expect(ia.chatStream).toHaveBeenCalledWith(
        expect.objectContaining({ scopeObject: expect.stringContaining('introuvable') }),
        expect.anything(),
      )
    })

    it('témoin : sans portée objet, aucune fiche ne part', async () => {
      const { ia, consultants, controller } = buildWithScopeReaders({})
      await controller.chat(user, { message: 'hi', accountId: 'a-1', conversationId: 'general' } as ChatDto, fakeRes())
      expect(consultants.findOneScoped).not.toHaveBeenCalled()
      expect(ia.chatStream).toHaveBeenCalledWith(expect.objectContaining({ scopeObject: undefined }), expect.anything())
    })
  })

  // #1950.17 — le plafond agrégé d'une réponse vient de la GRILLE, lu ici :
  // jamais du corps du navigateur, qui pourrait l'élever.
  it('#1950.17 — chat transmet le plafond de coût d’une réponse lu dans la grille', async () => {
    const { ia, controller } = build()
    await controller.chat(user, { message: 'hi', accountId: 'a-1', conversationId: 'general' } as ChatDto, fakeRes())
    expect(ia.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({ replyCostCeiling: LAURA_REPLY_COST_CEILING_CREDITS }),
      expect.anything(),
    )
  })

  // #1958.8 — la langue de l'INTERFACE, un champ DÉCLARÉ par le client (comme
  // pageContext / clarificationAsked), donc lu directement sur le DTO —
  // jamais résolu server-side par `chat-context`.
  it('chat forwards the declared interface language to the IA (#1958.8)', async () => {
    const { ia, controller } = build()
    await controller.chat(
      user,
      { message: 'hi', accountId: 'a-1', conversationId: 'general', interfaceLanguage: 'en' } as ChatDto,
      fakeRes(),
    )
    expect(ia.chatStream).toHaveBeenCalledWith(expect.objectContaining({ interfaceLanguage: 'en' }), expect.anything())
  })

  it('chat forwards no interface language when the client omits it — the IA defaults to French', async () => {
    const { ia, controller } = build()
    await controller.chat(user, { message: 'hi', accountId: 'a-1', conversationId: 'general' } as ChatDto, fakeRes())
    expect(ia.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({ interfaceLanguage: undefined }),
      expect.anything(),
    )
  })

  // #2453 — le mode de contexte est DÉCLARÉ par le client (sélecteur sous le
  // composeur) : lu sur le DTO, transmis tel quel, jamais un défaut inventé ici.
  it('chat forwards the declared context mode to the IA (#2453)', async () => {
    const { ia, controller } = build()
    await controller.chat(
      user,
      { message: 'hi', accountId: 'a-1', conversationId: 'general', contextMode: 'neutral' } as ChatDto,
      fakeRes(),
    )
    expect(ia.chatStream).toHaveBeenCalledWith(expect.objectContaining({ contextMode: 'neutral' }), expect.anything())
  })

  it('chat forwards no context mode when the client omits it (#2453)', async () => {
    const { ia, controller } = build()
    await controller.chat(user, { message: 'hi', accountId: 'a-1', conversationId: 'general' } as ChatDto, fakeRes())
    expect(ia.chatStream).toHaveBeenCalledWith(expect.objectContaining({ contextMode: undefined }), expect.anything())
  })

  // #1954.7 — le fil courant, lu sur le DTO : c'est lui qui borne la lecture
  // d'un document joint `scope: 'conversation'` côté service IA.
  it('chat forwards the thread id to the IA so a thread-scoped attachment can be read (#1954.7)', async () => {
    const { ia, controller } = build()
    await controller.chat(
      user,
      { message: 'hi', accountId: 'a-1', conversationId: 'account-a-1' } as ChatDto,
      fakeRes(),
    )
    expect(ia.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'account-a-1' }),
      expect.anything(),
    )
  })

  it('chat forwards the CRM presence read-back to the IA when the context resolved one', async () => {
    const { ia, chatContext, controller } = build()
    ;(chatContext.build as jest.Mock).mockResolvedValueOnce({
      accountData: { id: 'a-1', company_name: 'SNCF' },
      contactsSummary: null,
      planSummary: null,
      accountsSummary: null,
      profileData: {},
      pinnedFacts: [],
      userPreferences: {},
      conversationSummary: null,
      crmConnected: true,
      crmProvider: 'hubspot',
      crmPresence: 'CRM HubSpot consulté pour « SNCF » :\n- 3 contact(s) déjà dans votre CRM chez ce groupe',
    })
    await controller.chat(user, { message: 'hi', accountId: 'a-1' } as ChatDto, fakeRes())
    expect(ia.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        crmConnected: true,
        crmProvider: 'hubspot',
        crmPresence: expect.stringContaining('3 contact(s) déjà dans votre CRM'),
      }),
      // 2e argument : lecture de l'en-tête de coûts (D19), hors sujet ici.
      expect.anything(),
    )
  })

  it('chat rolls the conversation summary forward with the exchange (best-effort)', async () => {
    const { chatContext, controller } = build()
    await controller.chat(
      user,
      { message: 'quels comptes ?', accountId: 'a-1', conversationId: 'general' } as ChatDto,
      fakeRes(),
    )
    expect(chatContext.recordConversationTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: 'a-1',
        conversationId: 'general',
        userMessage: 'quels comptes ?',
        assistantReply: 'Priorise EDF et SNCF.',
      }),
    )
  })

  it('#1914 — le résumé roulant garde la carte en TEXTE (il repart dans le prompt) ; le navigateur la reçoit intacte', async () => {
    const { ia, chatContext, controller } = build()
    const fenced =
      'Voici.\n\n```bellum-block\n{"type":"verdict","conclusion":"Commence par EDF.","reasons":["Appel d’offres ouvert."]}\n```'
    ;(ia as unknown as { chatStream: jest.Mock }).chatStream = chatStreamOf({ success: true, data: { reply: fenced } })
    const res = fakeRes()
    await controller.chat(user, { message: 'par où ?', accountId: 'a-1', conversationId: 'general' } as ChatDto, res)

    const recorded = (chatContext.recordConversationTurn as jest.Mock).mock.calls[0][0].assistantReply as string
    expect(recorded).toContain('Commence par EDF.')
    expect(recorded).toContain('- Appel d’offres ouvert.')
    expect(recorded).not.toContain('```')
    expect(recorded).not.toContain('"type"')
    // L'écran, lui, a besoin de la carte : le flux la relaie telle quelle.
    const written = (res.write as jest.Mock).mock.calls.map(call => String(call[0])).join('')
    expect(written).toContain('bellum-block')
  })

  // ---- #1927 — l'état du fil : API → IA, IA → API, jamais vers le navigateur ----

  const threadState = {
    version: 1,
    objects: [{ kind: 'account', id: 'a-1', label: 'SNCF' }],
    focus: [{ kind: 'account', id: 'a-1', label: 'SNCF' }],
    last_list: null,
    searches: [{ tool: 'find_accounts', criteria: { sectors: ['transport'], department: '75' } }],
    proposals: [],
    questions: [],
    ruled_out: [],
    assumptions: [],
    // #2268.1 / #2268.5 / #2268.10
    goal: null,
    excluded: [],
    decisions: [],
    // #2268.12 / #2268.13 / #2268.15
    current_job: null,
    current_step: null,
    next_step: null,
    // #2268.7
    accepted: [],
    // #3178.1 / #3178.2
    persistent_scope: null,
    // #3187.4
    treated_entities: [],
    // #3191.3.12 (LAU-FINAL-197, épopée #3220)
    precautions: [],
    // #193.1
    facets: {},
    // #194.1 / #194.2
    correction: null,
    constraints: [],
    turns: 0,
    // #3223 (lot R17)
    last_account_verdict: null,
  }

  /** Les événements `done` réellement écrits vers le navigateur. */
  function doneEvents(res: Response): Array<Record<string, unknown>> {
    return (res.write as jest.Mock).mock.calls
      .map(
        ([chunk]) =>
          JSON.parse(
            String(chunk)
              .replace(/^data: /, '')
              .trim(),
          ) as Record<string, unknown>,
      )
      .filter(event => event['type'] === 'done')
  }

  it('chat forwards the reloaded thread state to the IA (#1927.10)', async () => {
    const { ia, chatContext, controller } = build()
    chatContext.build.mockResolvedValueOnce({ ...(await chatContext.build({} as never)), threadState } as ChatContext)
    await controller.chat(user, { message: 'et lui ?', conversationId: 'general' } as ChatDto, fakeRes())
    expect(ia.chatStream).toHaveBeenCalledWith(expect.objectContaining({ threadState }), expect.anything())
  })

  it('chat forwards NO thread state when the thread has none — the IA body stays byte-identical', async () => {
    const { ia, controller } = build()
    await controller.chat(user, { message: 'bonjour', conversationId: 'general' } as ChatDto, fakeRes())
    const input = (ia.chatStream as jest.Mock).mock.calls[0][0] as Record<string, unknown>
    expect(input['threadState']).toBeUndefined()
  })

  it('chat persists the thread state the IA returned, and never relays it to the browser', async () => {
    const { ia, chatContext, controller } = build()
    Object.assign(ia, {
      chatStream: chatStreamOf({ success: true, data: { reply: 'Voici SNCF.', thread_state: threadState } }),
    })
    const res = fakeRes()
    await controller.chat(user, { message: 'et lui ?', conversationId: 'general' } as ChatDto, res)

    const [done] = doneEvents(res)
    expect(done).toEqual({ type: 'done', success: true, data: { reply: 'Voici SNCF.' } })
    expect(chatContext.recordConversationTurn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'general', assistantReply: 'Voici SNCF.', threadState }),
    )
  })

  it('#2442.12 — chat records the turn costs tool by tool, and never relays them to the browser', async () => {
    const { ia, controller } = build()
    const turnCosts = [
      { provider: 'brave', operation: 'search', calls: 1, units: 1, cost_usd: 0.005, tool: 'web_search' },
      { provider: 'anthropic', operation: 'bellum_chat', calls: 1, units: 900, cost_usd: 0.01 },
    ]
    Object.assign(ia, {
      chatStream: chatStreamOf({ success: true, data: { reply: 'ok', turn_costs: turnCosts } }),
    })
    const providerCosts = new ProviderCostService({ insert: jest.fn() } as never)
    const record = jest.spyOn(providerCosts, 'record').mockResolvedValue()
    Object.assign(controller, { providerCosts })
    const res = fakeRes()
    await controller.chat(user, { message: 'x', conversationId: 'general' } as ChatDto, res)

    // D19 : un client ne voit jamais nos coûts.
    expect(doneEvents(res)[0]).toEqual({ type: 'done', success: true, data: { reply: 'ok' } })
    expect(record).toHaveBeenCalledWith(
      [
        expect.objectContaining({ provider: 'brave', tool: 'web_search' }),
        expect.not.objectContaining({ tool: expect.anything() }),
      ],
      expect.objectContaining({ feature: 'chat' }),
    )
  })

  it('chat never persists an unreadable thread state — and still keeps it away from the browser', async () => {
    const { ia, chatContext, controller } = build()
    Object.assign(ia, {
      chatStream: chatStreamOf({ success: true, data: { reply: 'ok', thread_state: { version: 99 } } }),
    })
    const res = fakeRes()
    await controller.chat(user, { message: 'x', conversationId: 'general' } as ChatDto, res)
    expect(doneEvents(res)[0]).toEqual({ type: 'done', success: true, data: { reply: 'ok' } })
    const recorded = chatContext.recordConversationTurn.mock.calls[0][0] as { threadState?: unknown }
    expect(recorded.threadState).toBeUndefined()
  })

  /**
   * #1941.5 / #1941.8 — le panneau « Ce que Laura utilise » doit montrer les
   * droits EFFECTIFS du lecteur, calculés CÔTÉ SERVEUR (jamais déduits par le
   * navigateur depuis son rôle affiché, qui ignorerait un accord en propre).
   * Décision de Louis du 15/09/2026.
   */
  describe('context.permissions — les droits EFFECTIFS du lecteur, calculés serveur (#1941.5 / #1941.8)', () => {
    it('un owner voit ses permissions natives dans context.permissions', async () => {
      const { ia, controller } = build()
      Object.assign(ia, {
        chatStream: chatStreamOf({ success: true, data: { reply: 'ok', context: { sources: [] } } }),
      })
      const res = fakeRes()
      await controller.chat(user, { message: 'x', conversationId: 'general' } as ChatDto, res)
      const context = doneEvents(res)[0]?.['data'] as { context?: { permissions?: string[] } }
      expect(context.context?.permissions).toEqual(expect.arrayContaining(['team:manage', 'billing:manage']))
    })

    it('sait dire NON : un viewer (aucune permission) reçoit un tableau VIDE, jamais deviné', async () => {
      const { ia, workspaceContext, controller } = build()
      Object.assign(workspaceContext, {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'viewer' }),
      })
      Object.assign(ia, {
        chatStream: chatStreamOf({ success: true, data: { reply: 'ok', context: { sources: [] } } }),
      })
      const res = fakeRes()
      await controller.chat(user, { message: 'x', conversationId: 'general' } as ChatDto, res)
      const context = doneEvents(res)[0]?.['data'] as { context?: { permissions?: string[] } }
      expect(context.context?.permissions).toEqual([])
    })

    it('un accord EN PROPRE (additif) élargit le tableau au-delà du rôle natif', async () => {
      const { ia, workspaceContext, controller } = build()
      Object.assign(workspaceContext, {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }),
        extraPermissionsOf: jest.fn().mockResolvedValue(['team:manage']),
      })
      Object.assign(ia, {
        chatStream: chatStreamOf({ success: true, data: { reply: 'ok', context: { sources: [] } } }),
      })
      const res = fakeRes()
      await controller.chat(user, { message: 'x', conversationId: 'general' } as ChatDto, res)
      const context = doneEvents(res)[0]?.['data'] as { context?: { permissions?: string[] } }
      expect(context.context?.permissions).toContain('team:manage')
      // `sales` ne porte pas `billing:manage`, et rien ici ne le lui accorde.
      expect(context.context?.permissions).not.toContain('billing:manage')
    })

    it('n’attrape pas ce qu’elle ne vise pas : sans `context` dans la réponse, aucun n’est inventé', async () => {
      const { ia, controller } = build()
      Object.assign(ia, { chatStream: chatStreamOf({ success: true, data: { reply: 'ok' } }) })
      const res = fakeRes()
      await controller.chat(user, { message: 'x', conversationId: 'general' } as ChatDto, res)
      expect(doneEvents(res)[0]).toEqual({ type: 'done', success: true, data: { reply: 'ok' } })
    })
  })

  /**
   * #1941.4 — « Comprendre les comptes lisibles » : le panneau NOMME les comptes
   * réellement servis, au lieu d'un nombre compté sur les LIGNES d'un texte
   * (`context_transparency._count_lines` comptait aussi l'en-tête du digest et
   * le bloc de mémoire marché).
   */
  describe('context.active.portfolio — les comptes lisibles, nommés par le serveur (#1941.4)', () => {
    const portfolioReply = {
      success: true,
      data: { reply: 'ok', context: { active: { portfolio: { present: true, count: 23 } } } },
    }

    async function withPortfolio(
      chatContext: { build: unknown },
      readablePortfolio: { names: string[]; total: number } | null,
    ) {
      const base = await (chatContext as unknown as { build: () => Promise<object> }).build()
      Object.assign(chatContext, { build: jest.fn().mockResolvedValue({ ...base, readablePortfolio }) })
    }

    it('remplace le compteur de lignes par la LISTE réellement servie, et le total de l’espace', async () => {
      const { ia, chatContext, controller } = build()
      await withPortfolio(chatContext, { names: ['SNCF', 'THALES'], total: 57 })
      Object.assign(ia, { chatStream: chatStreamOf(portfolioReply) })
      const res = fakeRes()
      await controller.chat(user, { message: 'x', conversationId: 'general' } as ChatDto, res)
      const data = doneEvents(res)[0]?.['data'] as {
        context?: { active?: { portfolio?: unknown } }
      }
      expect(data.context?.active?.portfolio).toEqual({
        present: true,
        count: 2,
        names: ['SNCF', 'THALES'],
        total: 57,
      })
    })

    it('sait dire NON : sans portefeuille lu dans ce tour, l’événement repart INTACT', async () => {
      const { ia, chatContext, controller } = build()
      await withPortfolio(chatContext, null)
      Object.assign(ia, { chatStream: chatStreamOf(portfolioReply) })
      const res = fakeRes()
      await controller.chat(user, { message: 'x', conversationId: 'general' } as ChatDto, res)
      const data = doneEvents(res)[0]?.['data'] as {
        context?: { active?: { portfolio?: unknown } }
      }
      expect(data.context?.active?.portfolio).toEqual({ present: true, count: 23 })
    })

    it('n’attrape pas ce qu’elle ne vise pas : sans bloc `active`, rien n’est posé', async () => {
      const { ia, chatContext, controller } = build()
      await withPortfolio(chatContext, { names: ['SNCF'], total: 1 })
      Object.assign(ia, {
        chatStream: chatStreamOf({ success: true, data: { reply: 'ok', context: { sources: [] } } }),
      })
      const res = fakeRes()
      await controller.chat(user, { message: 'x', conversationId: 'general' } as ChatDto, res)
      const data = doneEvents(res)[0]?.['data'] as { context?: { active?: unknown } }
      expect(data.context?.active).toBeUndefined()
    })
  })

  it('deleting a thread also forgets its summary and thread state (#1927.10)', async () => {
    const { chatMessages, chatContext, controller } = build()
    Object.assign(chatMessages, { deleteThread: jest.fn().mockResolvedValue(4) })
    Object.assign(chatContext, { forgetConversation: jest.fn().mockResolvedValue(2) })
    await expect(controller.deleteChatThread(user, { conversationId: 'general' } as never)).resolves.toEqual({
      messages: 4,
    })
    expect((chatContext as unknown as { forgetConversation: jest.Mock }).forgetConversation).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'general',
    })
  })

  it('a thread that does not exist is a 404 and forgets nothing', async () => {
    const { chatMessages, chatContext, controller } = build()
    Object.assign(chatMessages, { deleteThread: jest.fn().mockResolvedValue(0) })
    const forget = jest.fn()
    Object.assign(chatContext, { forgetConversation: forget })
    await expect(controller.deleteChatThread(user, { conversationId: 'nope' } as never)).rejects.toThrow(
      'Conversation introuvable',
    )
    expect(forget).not.toHaveBeenCalled()
  })

  it('a failure to forget the thread memory does not turn a done deletion into an error', async () => {
    const { chatMessages, chatContext, controller } = build()
    Object.assign(chatMessages, { deleteThread: jest.fn().mockResolvedValue(4) })
    Object.assign(chatContext, { forgetConversation: jest.fn().mockRejectedValue(new Error('db down')) })
    await expect(controller.deleteChatThread(user, { conversationId: 'general' } as never)).resolves.toEqual({
      messages: 4,
    })
  })

  /**
   * #1911.15 — le défaut vivant : `deleteThread` ne filtrait QUE par
   * `workspace_id`, donc n'importe quel membre pouvait supprimer le fil d'un
   * autre. Décision de Louis du 15/09/2026 : l'auteur du fil OU un porteur de
   * `team:manage` (la permission RBAC EXISTANTE la plus proche de « gérant de
   * l'espace » — invite/retire des membres, gère les invitations).
   */
  describe('deleteChatThread — auteur du fil OU gérant de l’espace (#1911.15)', () => {
    it('sait dire NON : ni auteur ni team:manage → 403, aucune suppression n’a lieu', async () => {
      const { chatMessages, workspaceContext, controller } = build()
      const deleteThread = jest.fn().mockResolvedValue(4)
      Object.assign(chatMessages, { threadAuthor: jest.fn().mockResolvedValue('u-2'), deleteThread })
      // `sales` porte `records:write` (donc passe la porte de route) mais PAS
      // `team:manage` — exactement le siège qui pouvait tout supprimer avant.
      Object.assign(workspaceContext, {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }),
      })
      await expect(controller.deleteChatThread(user, { conversationId: 'general' } as never)).rejects.toThrow(
        'Rôle insuffisant',
      )
      expect(deleteThread).not.toHaveBeenCalled()
    })

    it('un gérant de l’espace (team:manage natif, ex. owner) supprime le fil d’un AUTRE membre', async () => {
      const { chatMessages, workspaceContext, controller } = build()
      Object.assign(chatMessages, { threadAuthor: jest.fn().mockResolvedValue('u-2') })
      Object.assign(workspaceContext, {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      })
      await expect(controller.deleteChatThread(user, { conversationId: 'general' } as never)).resolves.toEqual({
        messages: 4,
      })
    })

    it('team:manage accordé EN PROPRE (additif au rôle) suffit aussi', async () => {
      const { chatMessages, workspaceContext, controller } = build()
      Object.assign(chatMessages, { threadAuthor: jest.fn().mockResolvedValue('u-2') })
      Object.assign(workspaceContext, {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }),
        extraPermissionsOf: jest.fn().mockResolvedValue(['team:manage']),
      })
      await expect(controller.deleteChatThread(user, { conversationId: 'general' } as never)).resolves.toEqual({
        messages: 4,
      })
    })

    it('n’attrape pas ce qu’elle ne vise pas : l’auteur supprime TOUJOURS son propre fil, même sans team:manage', async () => {
      const { chatMessages, workspaceContext, controller } = build()
      Object.assign(chatMessages, { threadAuthor: jest.fn().mockResolvedValue('u-1') })
      Object.assign(workspaceContext, {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }),
      })
      await expect(controller.deleteChatThread(user, { conversationId: 'general' } as never)).resolves.toEqual({
        messages: 4,
      })
    })

    // Défaut mesuré (vague 11, 21/09/2026) : le double de `chatContext` du
    // `build()` de tête n'exposait QUE `build`/`recordConversationTurn` —
    // `#1927.10` a ajouté `forgetConversation` au VRAI `ChatContextService`
    // sans que ce double la reçoive. Chaque test de ce describe (aucun ne
    // stub `forgetConversation`, contrairement aux trois tests dédiés juste
    // au-dessus) faisait donc échouer l'appel en silence — le contrôleur
    // l'avale (#1927.10 : « n'avale PAS l'échec » ne s'applique qu'au 404,
    // pas ici) et journalise une ERREUR à chaque suppression, alors que la
    // mémoire du fil est réellement effacée en production. Un double qui
    // dérive de l'interface réelle reste un défaut même quand il ne fait
    // rougir aucune assertion.
    it('sait dire NON : la mémoire du fil part sans journaliser d’erreur, même sans stub explicite (#1927.10)', async () => {
      const { chatMessages, workspaceContext, controller } = build()
      Object.assign(chatMessages, { threadAuthor: jest.fn().mockResolvedValue('u-2') })
      Object.assign(workspaceContext, {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      })
      const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
      await expect(controller.deleteChatThread(user, { conversationId: 'general' } as never)).resolves.toEqual({
        messages: 4,
      })
      expect(loggerError).not.toHaveBeenCalled()
      loggerError.mockRestore()
    })
  })

  it('icebreaker uses the JWT userId + resolves the ESN profile server-side', async () => {
    const { ia, esnProfile, controller } = build()
    await controller.icebreaker(user, { contactId: 'c-9' } as IcebreakerDto)
    expect(esnProfile.resolveProfileData).toHaveBeenCalledWith('u-1')
    expect(ia.icebreaker).toHaveBeenCalledWith({
      userId: 'u-1',
      contactId: 'c-9',
      profileData: { companyName: 'MonESN', size: '50', sectors: ['Banque'] },
    })
  })

  describe('extractSearchEntity (#2810)', () => {
    it('proxies the typed text and returns the extracted company', async () => {
      const { ia, controller } = build()
      Object.assign(ia, { extractSearchEntity: jest.fn().mockResolvedValue('BPCE') })
      const result = await controller.extractSearchEntity({
        text: 'analyse-moi BPCE sur les enjeux IAM',
        locale: 'fr',
      } as SearchEntityExtractDto)
      expect(ia.extractSearchEntity).toHaveBeenCalledWith({
        text: 'analyse-moi BPCE sur les enjeux IAM',
        locale: 'fr',
      })
      expect(result).toEqual({ company: 'BPCE' })
    })

    it('sait dire NON : aucune donnée d’espace lue, aucun nom deviné en repli', async () => {
      const { ia, controller } = build()
      const result = await controller.extractSearchEntity({
        text: 'quels comptes prioriser ?',
      } as SearchEntityExtractDto)
      expect(ia.extractSearchEntity).toHaveBeenCalledWith({ text: 'quels comptes prioriser ?', locale: undefined })
      expect(result).toEqual({ company: null })
    })
  })

  it('#2648.1 — a named `insufficient_context` failure reaches the client as a 422 with `code`, not a bare 500', async () => {
    const { ia, controller } = build()
    const cause = new HttpError(
      422,
      JSON.stringify({
        detail: { code: 'insufficient_context', message: 'Ni poste connu ni signal récent sur ce contact.' },
      }),
      false,
      'ia:icebreaker/generate',
    )
    Object.assign(ia, {
      icebreaker: jest.fn().mockRejectedValue(new TechnicalError('HTTP request failed', { cause })),
    })

    const failure = await controller.icebreaker(user, { contactId: 'c-9' } as IcebreakerDto).catch(e => e)

    expect(failure).toBeInstanceOf(HttpException)
    expect(failure.getStatus()).toBe(422)
    expect(failure.getResponse()).toMatchObject({ code: 'icebreaker_insufficient_context' })
  })

  it('#2648.1 — an unnamed engine failure (Claude, network…) never fabricates `insufficient_context`', async () => {
    const { ia, controller } = build()
    const cause = new HttpError(502, 'boom', true, 'ia:icebreaker/generate')
    Object.assign(ia, {
      icebreaker: jest.fn().mockRejectedValue(new TechnicalError('HTTP request failed', { cause })),
    })

    const failure = await controller.icebreaker(user, { contactId: 'c-9' } as IcebreakerDto).catch(e => e)

    expect(failure).toBeInstanceOf(HttpException)
    expect(failure.getStatus()).toBe(503)
    expect(failure.getResponse()).toMatchObject({ code: 'icebreaker_upstream_error' })
  })

  it('weeklyBriefing uses the JWT userId + resolves the ESN profile server-side (no retry, longer deadline)', async () => {
    const { ia, esnProfile, controller } = build()
    await controller.weeklyBriefing(user)
    expect(esnProfile.resolveProfileData).toHaveBeenCalledWith('u-1')
    expect(ia.weeklyBriefing).toHaveBeenCalledWith(
      { userId: 'u-1', profileData: { companyName: 'MonESN', size: '50', sectors: ['Banque'] } },
      { maxAttempts: 1, timeoutMs: 45_000 },
    )
  })

  it('battlecard uses the JWT userId + resolves the ESN profile server-side', async () => {
    const { ia, esnProfile, controller } = build()
    await controller.battlecard(user, { accountId: 'a-1' } as BattlecardDto)
    expect(esnProfile.resolveProfileData).toHaveBeenCalledWith('u-1')
    expect(ia.battlecard).toHaveBeenCalledWith({
      userId: 'u-1',
      accountId: 'a-1',
      profileData: { companyName: 'MonESN', size: '50', sectors: ['Banque'] },
    })
  })

  it('compare forwards the picked account ids with the JWT userId + resolved profile', async () => {
    const { ia, esnProfile, controller } = build()
    await controller.compare(user, { accountIds: ['a-1', 'a-2'] } as CompareDto)
    expect(esnProfile.resolveProfileData).toHaveBeenCalledWith('u-1')
    expect(ia.compareAccounts).toHaveBeenCalledWith({
      userId: 'u-1',
      accountIds: ['a-1', 'a-2'],
      profileData: { companyName: 'MonESN', size: '50', sectors: ['Banque'] },
    })
  })

  // Multi-user Phase 2: chat is team-scoped. The controller resolves the JWT
  // user's active workspace and passes THAT to the store — never a body value.
  it('listChatMessages reads the thread scoped to the resolved workspace', async () => {
    const { chatMessages, workspaceContext, controller } = build()
    await controller.listChatMessages(user, { accountId: 'a-1', limit: 20 } as ListChatMessagesDto)
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(chatMessages.listThread).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', accountId: 'a-1', limit: 20 }),
    )
  })

  it('createChatMessage stamps both the JWT user_id and the active workspace_id', async () => {
    const { chatMessages, workspaceContext, controller } = build()
    await controller.createChatMessage(user, {
      accountId: 'a-1',
      role: 'user',
      content: 'hi',
    } as CreateChatMessageDto)
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(chatMessages.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1', content: 'hi' }),
    )
  })

  /**
   * #3775.2b — « Partager un lien ne partage pas les identifiants d'un
   * connecteur ; un extrait sensible déjà écrit n'est pas protégé par la
   * fermeture de sa source. » Une source citée dont la famille (`kind`)
   * correspond à une connexion PERSONNELLE de l'auteur (`owner: 'user'`,
   * BEL-INT-604) est marquée `restricted: true` AVANT l'écriture.
   */
  describe('#3775.2b — les sources d’une connexion personnelle sont marquées à l’écriture', () => {
    it('marque `restricted: true` sur une source dont la famille est une connexion PERSONNELLE', async () => {
      const { chatMessages, controller } = build([
        { provider: 'gmail', family: 'email', owner: 'user' } as unknown as ConnectedTool,
      ])
      await controller.createChatMessage(user, {
        accountId: 'a-1',
        role: 'assistant',
        content: 'Voilà.',
        context: { sources: [{ kind: 'email', label: 'Gmail', as_of: null }], not_consulted: [] },
      } as CreateChatMessageDto)
      expect(chatMessages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            sources: [{ kind: 'email', label: 'Gmail', as_of: null, restricted: true }],
          }),
        }),
      )
    })

    it('une connexion D’ESPACE ne marque rien — le CRM d’espace n’est pas restreint', async () => {
      const { chatMessages, controller } = build([
        { provider: 'hubspot', family: 'crm', owner: 'workspace' } as unknown as ConnectedTool,
      ])
      await controller.createChatMessage(user, {
        accountId: 'a-1',
        role: 'assistant',
        content: 'Voilà.',
        context: { sources: [{ kind: 'crm', label: 'HubSpot', as_of: null }], not_consulted: [] },
      } as CreateChatMessageDto)
      const written = chatMessages.create.mock.calls[0]?.[0] as {
        context?: { sources: Array<Record<string, unknown>> }
      }
      expect(written.context?.sources[0]).not.toHaveProperty('restricted')
    })

    it('aucun contexte envoyé : le registre n’est jamais consulté — un message tapé ne coûte rien de plus', async () => {
      const { chatMessages, toolRegistry, controller } = build()
      await controller.createChatMessage(user, {
        accountId: 'a-1',
        role: 'user',
        content: 'hi',
      } as CreateChatMessageDto)
      expect(toolRegistry.list).not.toHaveBeenCalled()
      expect(chatMessages.create).toHaveBeenCalledWith(expect.not.objectContaining({ context: expect.anything() }))
    })
  })

  it('listChatHistory reads history scoped to the resolved workspace', async () => {
    const { chatMessages, controller } = build()
    await controller.listChatHistory(user, { limit: 10 } as ListChatHistoryDto)
    // #2703 — la liste porte les fils par défaut de L'APPELANT, plus les conversations de l'espace.
    expect(chatMessages.listHistory).toHaveBeenCalledWith('ws-1', 'u-1', 10, false)
  })

  // #1940.1 — mentionner un collègue prévient réellement le collègue, pas
  // seulement le texte `@Nom` déjà inséré côté navigateur (`Chat.tsx`).
  describe('#1940.1 — mentionner un collègue déclenche une vraie notification', () => {
    function buildWithMentions(members: { userId: string; fullName: string | null }[]) {
      const base = build()
      const notifications = { createNotification: jest.fn().mockResolvedValue({ id: 'n-1' }) }
      const workspaceContext = {
        ...base.workspaceContext,
        listMembers: jest.fn().mockResolvedValue(members),
      }
      const controller = new IaProxyController(
        base.ia as unknown as IaClient,
        base.chatMessages as unknown as ChatMessagesService,
        workspaceContext as unknown as WorkspaceContextService,
        base.esnProfile as unknown as EsnProfileReader,
        base.chatContext as unknown as ChatContextService,
        base.portfolio as unknown as DiscoverPortfolioService,
        { get: () => 0 } as unknown as ConfigService,
        { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
        {
          readableThread: jest.fn(
            async (target: { conversationId: string | null }) => target.conversationId ?? undefined,
          ),
        } as unknown as ChatThreadDocumentsService,
        // 21 paramètres `@Optional()` : `notifications` est le 20e (avant
        // `conversations`) — voir l'ordre documenté dans le constructeur.
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        notifications as unknown as NotificationsService,
      )
      return { notifications, chatMessages: base.chatMessages, controller }
    }

    it('notifie le collègue mentionné, jamais son auteur', async () => {
      const { notifications, controller } = buildWithMentions([
        { userId: 'u-1', fullName: 'Théo Martin' },
        { userId: 'u-alice', fullName: 'Alice Dupont' },
      ])
      await controller.createChatMessage(user, {
        accountId: 'a-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Peux-tu voir ça avec @Alice ?',
      } as CreateChatMessageDto)
      expect(notifications.createNotification).toHaveBeenCalledTimes(1)
      expect(notifications.createNotification).toHaveBeenCalledWith(
        'u-alice',
        expect.objectContaining({
          type: 'chat_mention',
          title: expect.stringContaining('Théo Martin'),
          link: expect.stringContaining('conv-1'),
        }),
      )
    })

    it('un message sans mention ne notifie personne', async () => {
      const { notifications, controller } = buildWithMentions([
        { userId: 'u-1', fullName: 'Théo Martin' },
        { userId: 'u-alice', fullName: 'Alice Dupont' },
      ])
      await controller.createChatMessage(user, {
        accountId: 'a-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Aucune mention ici',
      } as CreateChatMessageDto)
      expect(notifications.createNotification).not.toHaveBeenCalled()
    })

    it('une réponse de Laura ne déclenche jamais de notification de mention', async () => {
      const { notifications, controller } = buildWithMentions([
        { userId: 'u-1', fullName: 'Théo Martin' },
        { userId: 'u-alice', fullName: 'Alice Dupont' },
      ])
      await controller.createChatMessage(user, {
        accountId: 'a-1',
        conversationId: 'conv-1',
        role: 'assistant',
        content: '@Alice, voici ma réponse',
      } as CreateChatMessageDto)
      expect(notifications.createNotification).not.toHaveBeenCalled()
    })

    it('sans le module notifications, le message reste écrit sans erreur', async () => {
      const { chatMessages, controller } = build()
      const result = await controller.createChatMessage(user, {
        accountId: 'a-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Peux-tu voir ça avec @Alice ?',
      } as CreateChatMessageDto)
      expect(chatMessages.create).toHaveBeenCalled()
      expect(result.message).toEqual({ id: 'm-1' })
    })
  })

  // #1940.7 — attribuer une carte d'action de Laura à un collègue (sélecteur
  // « assigner à », relié à `useWorkspaceMembers`) déclenche une vraie
  // notification — le même mécanisme que #1940.1, un geste EXPLICITE plutôt
  // qu'une mention en texte.
  describe('#1940.7 — attribuer la prochaine action déclenche une vraie notification', () => {
    function buildWithMembers(members: { userId: string; fullName: string | null }[]) {
      const base = build()
      const notifications = { createNotification: jest.fn().mockResolvedValue({ id: 'n-1' }) }
      const workspaceContext = {
        ...base.workspaceContext,
        listMembers: jest.fn().mockResolvedValue(members),
      }
      const controller = new IaProxyController(
        base.ia as unknown as IaClient,
        base.chatMessages as unknown as ChatMessagesService,
        workspaceContext as unknown as WorkspaceContextService,
        base.esnProfile as unknown as EsnProfileReader,
        base.chatContext as unknown as ChatContextService,
        base.portfolio as unknown as DiscoverPortfolioService,
        { get: () => 0 } as unknown as ConfigService,
        { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
        {
          readableThread: jest.fn(
            async (target: { conversationId: string | null }) => target.conversationId ?? undefined,
          ),
        } as unknown as ChatThreadDocumentsService,
        // Même position que la suite #1940.1 : `notifications` est le 20e des
        // paramètres `@Optional()`.
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        notifications as unknown as NotificationsService,
      )
      return { notifications, workspaceContext, controller }
    }

    it('notifie le collègue assigné, avec le résumé de la carte et le lien du fil', async () => {
      const { notifications, controller } = buildWithMembers([
        { userId: 'u-1', fullName: 'Théo Martin' },
        { userId: 'u-alice', fullName: 'Alice Dupont' },
      ])
      const result = await controller.assignPendingAction(user, {
        conversationId: 'conv-1',
        accountId: 'a-1',
        summary: 'Relancer SNCF sur le devis cybersécurité',
        assigneeUserId: 'u-alice',
      } as AssignPendingActionDto)
      expect(notifications.createNotification).toHaveBeenCalledWith(
        'u-alice',
        expect.objectContaining({
          type: 'chat_action_assigned',
          title: expect.stringContaining('Théo Martin'),
          link: '/chat?conversationId=conv-1&accountId=a-1',
        }),
      )
      expect(result).toEqual({ assignedTo: 'u-alice' })
    })

    it('refuse un assigné qui ne fait pas partie de l’espace', async () => {
      const { notifications, controller } = buildWithMembers([{ userId: 'u-1', fullName: 'Théo Martin' }])
      await expect(
        controller.assignPendingAction(user, {
          conversationId: 'conv-1',
          accountId: null,
          summary: 'Relancer SNCF',
          assigneeUserId: 'u-inconnu',
        } as AssignPendingActionDto),
      ).rejects.toThrow(BadRequestException)
      expect(notifications.createNotification).not.toHaveBeenCalled()
    })

    it('sans le module notifications, la porte refuse plutôt que de faire semblant', async () => {
      const { controller } = build()
      await expect(
        controller.assignPendingAction(user, {
          conversationId: 'conv-1',
          accountId: null,
          summary: 'Relancer SNCF',
          assigneeUserId: 'u-alice',
        } as AssignPendingActionDto),
      ).rejects.toThrow(ServiceUnavailableException)
    })
  })
})
