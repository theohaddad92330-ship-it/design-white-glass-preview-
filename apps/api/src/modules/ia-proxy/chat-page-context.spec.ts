import type { ConfigService } from '@nestjs/config'
import type { Response } from 'express'
import type { LauraPageContext } from '@bellum/contracts'
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
 * LA BULLE DIT OÙ ELLE EST — et l'écran `/chat`, qui ne dit rien, ne change pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX MOITIÉS QUI COMPTENT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Ce que l'écran déclare atteint vraiment le service IA.** Le dépôt corrige
 *    depuis six chantiers le même défaut : du code juste, calculé, testé, que
 *    personne n'appelle. Un champ ajouté au DTO et jamais relayé serait
 *    exactement ça — et rien ne tomberait.
 * 2. **Un appelant qui ne déclare rien obtient le corps d'AVANT, au champ près.**
 *    C'est ce qui garantit que le golden `advisor.txt` et l'empreinte du
 *    registre de prompts ne bougent pas, et donc que ce lot ne touche pas
 *    l'écran `/chat`.
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
    {
      build: jest.fn().mockResolvedValue(chatCtx),
      recordConversationTurn: jest.fn().mockResolvedValue(undefined),
    } as unknown as ChatContextService,
    { resolve: jest.fn().mockResolvedValue([]) } as unknown as DiscoverPortfolioService,
    // Plafond désactivé : cette suite prouve le relais du contexte, pas la borne.
    { get: () => 0 } as unknown as ConfigService,
    { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
    // #1954 — obligatoire ; cette suite prouve le contexte de page, pas le fil.
    { readableThread: jest.fn().mockResolvedValue(undefined) } as unknown as ChatThreadDocumentsService,
  )
  return { ia, controller }
}

const CONTEXT: LauraPageContext = {
  kind: 'invoicing',
  label: 'Facturation',
  entityId: null,
  facets: [{ label: 'Mois', value: 'mars 2026' }],
  state: 'ready',
}

describe('le contexte de page voyage jusqu’au service IA', () => {
  it('rend l’écran déclaré en texte et le passe au client IA', async () => {
    const { ia, controller } = build()
    await controller.chat(user, { message: 'C’est quoi ce chiffre ?', pageContext: CONTEXT } as ChatDto, fakeRes())

    const sent = (ia.chatStream as jest.Mock).mock.calls[0][0] as { pageContext?: string }
    expect(sent.pageContext).toContain('Facturation')
    expect(sent.pageContext).toContain('Mois : mars 2026')
  })

  it('ne met JAMAIS l’identifiant de l’objet dans le texte lu par le modèle', async () => {
    const { ia, controller } = build()
    const withEntity: LauraPageContext = {
      ...CONTEXT,
      kind: 'account',
      entityId: '11111111-2222-3333-4444-555555555555',
    }
    await controller.chat(user, { message: 'Résume', pageContext: withEntity } as ChatDto, fakeRes())

    const sent = (ia.chatStream as jest.Mock).mock.calls[0][0] as { pageContext?: string }
    expect(sent.pageContext).not.toContain('11111111-2222-3333-4444-555555555555')
  })

  it('dit que l’écran charge plutôt que de laisser le modèle inventer un chiffre', async () => {
    const { ia, controller } = build()
    await controller.chat(
      user,
      { message: 'Alors ?', pageContext: { ...CONTEXT, state: 'loading' } } as ChatDto,
      fakeRes(),
    )

    const sent = (ia.chatStream as jest.Mock).mock.calls[0][0] as { pageContext?: string }
    expect(sent.pageContext).toContain('n’a PAS fini de charger')
    expect(sent.pageContext).not.toContain('mars 2026')
  })

  it('un appelant sans contexte envoie une chaîne VIDE — le prompt d’avant, au byte près', async () => {
    const { ia, controller } = build()
    await controller.chat(user, { message: 'Bonjour' } as ChatDto, fakeRes())

    const sent = (ia.chatStream as jest.Mock).mock.calls[0][0] as { pageContext?: string }
    expect(sent.pageContext).toBe('')
  })
})

describe('le contexte de page est BORNÉ à l’entrée — c’est du texte venu du navigateur', () => {
  it('accepte une déclaration bien formée', () => {
    expect(chatSchema.safeParse({ message: 'x', pageContext: CONTEXT }).success).toBe(true)
  })

  it('refuse un titre à rallonge — un prompt n’est pas un champ libre', () => {
    const long = { ...CONTEXT, label: 'x'.repeat(161) }
    expect(chatSchema.safeParse({ message: 'x', pageContext: long }).success).toBe(false)
  })

  it('refuse un genre d’écran inventé', () => {
    const bogus = { ...CONTEXT, kind: 'admin_secret' }
    expect(chatSchema.safeParse({ message: 'x', pageContext: bogus }).success).toBe(false)
  })

  it('reste facultatif — c’est ce qui rend le champ ADDITIF', () => {
    expect(chatSchema.safeParse({ message: 'x' }).success).toBe(true)
    expect(chatSchema.safeParse({ message: 'x', pageContext: null }).success).toBe(true)
  })
})

// #3768 (BEL-LAU-1014) — le geste « retravailler cette réponse » voyage avec le
// tour jusqu'au service IA, borné par le schéma du contrat.
describe('le geste de transformation de réponse voyage jusqu’au service IA', () => {
  const REPLY_TRANSFORM: NonNullable<ChatDto['replyTransform']> = {
    id: 'priorities_only',
    sourceText: '1. Alpha — contrat en fin de cycle\n2. Beta — nouveau DSI',
    layout: 'list',
    accountIds: [],
    reserves: [],
  }

  it('passe le geste au client IA, sans le réécrire', async () => {
    const { ia, controller } = build()
    await controller.chat(
      user,
      { message: 'Voir seulement les priorités', replyTransform: REPLY_TRANSFORM } as ChatDto,
      fakeRes(),
    )

    const sent = (ia.chatStream as jest.Mock).mock.calls[0][0] as { replyTransform?: unknown }
    expect(sent.replyTransform).toEqual(REPLY_TRANSFORM)
  })

  it('n’envoie rien pour un tour ordinaire', async () => {
    const { ia, controller } = build()
    await controller.chat(user, { message: 'Bonjour' } as ChatDto, fakeRes())

    const sent = (ia.chatStream as jest.Mock).mock.calls[0][0] as { replyTransform?: unknown }
    expect(sent.replyTransform).toBeUndefined()
  })

  it('refuse un geste inconnu et une source vide à la porte', () => {
    expect(chatSchema.safeParse({ message: 'x', replyTransform: { ...REPLY_TRANSFORM, id: 'inconnu' } }).success).toBe(
      false,
    )
    expect(chatSchema.safeParse({ message: 'x', replyTransform: { ...REPLY_TRANSFORM, sourceText: '' } }).success).toBe(
      false,
    )
    expect(chatSchema.safeParse({ message: 'x', replyTransform: REPLY_TRANSFORM }).success).toBe(true)
  })
})
