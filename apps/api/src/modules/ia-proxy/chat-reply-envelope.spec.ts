import type { ConfigService } from '@nestjs/config'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { CopilotCardService } from '../action-os/copilot-card.service'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { IaClient } from '../ia/ia.client'
import type { ToolRegistryService } from '../tool-registry/tool-registry.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import type { CreateChatMessageDto, ListChatMessagesDto } from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/**
 * #2429.2 / #2429.4 / #2429.9 — L'ENVELOPPE DE RÉPONSE EST UNE VUE, PAS UNE
 * SECONDE ÉCRITURE.
 *
 * `GET /ia/chat/messages` et `POST /ia/chat/messages` posent déjà `context`,
 * `laura_job`, les cartes du tour : `envelope` ne fait que les NOMMER, sous la
 * forme `chatReplyEnvelopeSchema` de `@bellum/contracts`, recalculée à chaque
 * lecture. Ce que cette suite tient :
 *
 *  1. une question de la personne ne porte AUCUNE enveloppe — ce n'est pas une
 *     réponse à adresser ;
 *  2. un bloc du texte gagne une ADRESSE stable (`message_id:rang`), dans
 *     l'ordre où le texte les écrit ;
 *  3. `sources` / `clarification` (`reply_options`) / `warnings` (`partial`) se
 *     nomment sous la brique déjà persistée, jamais une seconde copie ;
 *  4. `actions` reprend les cartes GOUVERNÉES du tour, quand la lecture les
 *     connaît déjà — jamais recalculées ;
 *  5. l'écriture (`POST /ia/chat/messages`) pose la même enveloppe sur ce
 *     qu'elle vient de créer, sans attendre un rechargement.
 */

const USER = { userId: '9d359267-0000-4000-8000-000000000001', email: 'rep@esn.fr' } as CurrentUserPayload
const TURN = '33333333-3333-4333-8333-333333333333'

const VERDICT_BLOCK = {
  type: 'verdict',
  conclusion: 'Commence par le compte Alpha cette semaine.',
  reasons: ["Un appel d'offres est ouvert jusqu'au 30 septembre."],
}

const CARD_VIEW = { id: 'run-1', state: 'prepared', proposalIndex: 0, primary: true, turnId: TURN }

function fenced(block: unknown): string {
  return '```bellum-block\n' + JSON.stringify(block) + '\n```'
}

function build(options: { withCards?: boolean } = {}) {
  const chatMessages = {
    listThread: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    turnIdsOf: jest.fn().mockResolvedValue(new Map()),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    extraPermissionsOf: jest.fn().mockResolvedValue([]),
    isDemoWorkspace: jest.fn().mockResolvedValue(false),
  }
  const cards = {
    proposeTurn: jest.fn(),
    listForThread: jest.fn().mockResolvedValue([CARD_VIEW]),
  }
  const controller = new IaProxyController(
    {} as unknown as IaClient,
    chatMessages as unknown as ChatMessagesService,
    workspaceContext as unknown as WorkspaceContextService,
    { resolveProfileData: jest.fn() } as unknown as EsnProfileReader,
    {} as unknown as ChatContextService,
    {} as DiscoverPortfolioService,
    { get: () => 0 } as unknown as ConfigService,
    { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
    {
      readableThread: jest.fn(async (target: { conversationId: string | null }) => target.conversationId ?? undefined),
    } as unknown as ChatThreadDocumentsService,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.withCards === false ? undefined : (cards as unknown as CopilotCardService),
  )
  return { controller, chatMessages, cards }
}

describe('GET /ia/chat/messages — envelope', () => {
  it('une question de la personne ne porte aucune enveloppe', async () => {
    const { controller, chatMessages } = build()
    chatMessages.listThread.mockResolvedValue([{ id: 'm-user', role: 'user', content: 'Relance Claire ?' }])
    const result = await controller.listChatMessages(USER, {
      conversationId: 'conv-1',
      limit: 50,
    } as ListChatMessagesDto)
    expect(result.messages[0]).not.toHaveProperty('envelope')
  })

  it('chaque bloc du texte reçoit son adresse, dans l’ordre où le texte les écrit', async () => {
    const { controller, chatMessages } = build({ withCards: false })
    const content = `Avant.\n\n${fenced(VERDICT_BLOCK)}\n\nEntre deux.\n\n${fenced(VERDICT_BLOCK)}`
    chatMessages.listThread.mockResolvedValue([{ id: 'm-bot', role: 'assistant', content }])

    const result = await controller.listChatMessages(USER, {
      conversationId: 'conv-1',
      limit: 50,
    } as ListChatMessagesDto)

    const envelope = (result.messages[0] as { envelope: { artifacts: Array<{ id: string; block: unknown }> } }).envelope
    expect(envelope.artifacts.map(artifact => artifact.id)).toEqual(['m-bot:0', 'm-bot:1'])
    expect(envelope.artifacts[0]?.block).toEqual(VERDICT_BLOCK)
  })

  it('sources / clarification / warnings se nomment sous la brique déjà persistée (`context`)', async () => {
    const { controller, chatMessages } = build({ withCards: false })
    chatMessages.listThread.mockResolvedValue([
      {
        id: 'm-bot',
        role: 'assistant',
        content: 'Il me faut une précision.',
        context: {
          sources: [{ kind: 'crm', label: 'Salesforce', as_of: '2026-09-20' }],
          reply_options: [{ question: 'Lequel ?', options: ['A', 'B'] }],
          partial: { reason: 'turn_timeout' },
        },
      },
    ])

    const result = await controller.listChatMessages(USER, {
      conversationId: 'conv-1',
      limit: 50,
    } as ListChatMessagesDto)

    expect((result.messages[0] as { envelope: unknown }).envelope).toEqual({
      message: 'Il me faut une précision.',
      artifacts: [],
      clarification: [{ question: 'Lequel ?', options: ['A', 'B'] }],
      sources: [{ kind: 'crm', label: 'Salesforce', as_of: '2026-09-20' }],
      warnings: [{ reason: 'turn_timeout' }],
    })
  })

  it('`actions` reprend les cartes GOUVERNÉES du tour, jamais recalculées', async () => {
    const { controller, chatMessages } = build()
    chatMessages.listThread.mockResolvedValue([{ id: 'm-bot', role: 'assistant', content: 'Voici deux actions.' }])
    chatMessages.turnIdsOf.mockResolvedValue(new Map([['m-bot', TURN]]))

    const result = await controller.listChatMessages(USER, {
      conversationId: 'conv-1',
      limit: 50,
    } as ListChatMessagesDto)

    expect((result.messages[0] as { envelope: { actions?: unknown[] } }).envelope.actions).toEqual([CARD_VIEW])
  })
})

describe('POST /ia/chat/messages — envelope', () => {
  it('la réponse fraîchement créée porte déjà son enveloppe, sans attendre un rechargement', async () => {
    const { controller, chatMessages } = build({ withCards: false })
    chatMessages.create.mockResolvedValue({
      id: 'm-bot',
      role: 'assistant',
      content: `${fenced(VERDICT_BLOCK)}`,
      context: null,
    })

    const result = await controller.createChatMessage(USER, {
      conversationId: 'conv-1',
      role: 'assistant',
      content: fenced(VERDICT_BLOCK),
      turnId: TURN,
    } as CreateChatMessageDto)

    const envelope = (result.message as { envelope: { artifacts: Array<{ id: string }> } }).envelope
    // #2429.4 — le contrat d'artefact : adresse, contenu, et ce qu'il EST (type,
    // message, rang, version 1 tant que personne ne l'a modifié).
    expect(envelope.artifacts).toEqual([
      {
        id: 'm-bot:0',
        type: 'verdict',
        message_id: 'm-bot',
        rank: 0,
        version: 1,
        edited_at: null,
        edited_by: null,
        block: VERDICT_BLOCK,
      },
    ])
  })

  it('un message TAPÉ (jamais une réponse) ne porte aucune enveloppe', async () => {
    const { controller, chatMessages } = build({ withCards: false })
    chatMessages.create.mockResolvedValue({ id: 'm-user', role: 'user', content: 'Relance Claire ?', context: null })

    const result = await controller.createChatMessage(USER, {
      conversationId: 'conv-1',
      role: 'user',
      content: 'Relance Claire ?',
    } as CreateChatMessageDto)

    expect(result.message).not.toHaveProperty('envelope')
  })
})
