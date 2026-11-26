import { ConflictException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { ChatThreadTargetDto, ListChatMessagesDto } from './dto/ia-proxy.dto'
import { IaProxyController } from './ia-proxy.controller'

/**
 * #2430 — L'OBJET CONVERSATION BRANCHÉ SUR LES ROUTES DU FIL.
 *
 * Le service (`chat-conversations.service.spec.ts`) prouve ce qu'il persiste ;
 * cette suite prouve que les routes QUI EXISTAIENT le lisent :
 *  · #2430.10 — retirer un fil sous conservation légale répond 409 ;
 *  · #2430.12 — le propriétaire DÉCLARÉ décide qui peut retirer le fil ;
 *  · #2430.4  — `?version=` borne la lecture du fil, et une version inconnue
 *    est un 404, jamais le fil vivant servi à sa place.
 *
 * Le contrôleur est monté par ses CHAMPS (et non par position) : il a plus de
 * trente dépendances, et seules celles des trois routes lues ici comptent.
 */
const USER = { userId: 'u-1' } as CurrentUserPayload
const CONV = 'conv-1'

function build(
  options: {
    hold?: boolean
    owner?: string
    bound?: Date | null
    role?: string
    visibility?: 'open' | 'restricted'
    citesOutside?: boolean
  } = {},
) {
  const chatMessages = {
    threadAuthor: jest.fn().mockResolvedValue('u-1'),
    deleteThread: jest.fn().mockResolvedValue(3),
    listThread: jest.fn().mockResolvedValue([]),
  }
  const conversations = {
    ownerOf: jest.fn().mockResolvedValue(options.owner ?? 'u-1'),
    isOnLegalHold: jest.fn().mockResolvedValue(options.hold ?? false),
    versionBound: jest.fn().mockResolvedValue(options.bound === undefined ? null : options.bound),
    citesAccountOutside: jest.fn().mockResolvedValue(options.citesOutside ?? false),
  }
  const controller = Object.create(IaProxyController.prototype) as IaProxyController
  Object.assign(controller, {
    logger: new Logger('test'),
    chatMessages,
    conversations,
    workspaceContext: {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: options.role ?? 'member' }),
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
      portfolioVisibilityOf: jest.fn().mockResolvedValue(options.visibility ?? 'open'),
    },
    threadDocuments: { deleteForThread: jest.fn().mockResolvedValue(0) },
    threadTitles: { forget: jest.fn().mockResolvedValue(undefined) },
    chatContext: { forgetConversation: jest.fn().mockResolvedValue(undefined) },
  })
  return { controller, chatMessages, conversations }
}

const target = { conversationId: CONV, accountId: null } as unknown as ChatThreadTargetDto

describe('deleteChatThread — #2430.10 conservation légale', () => {
  it('refuse de retirer un fil sous conservation légale (409), sans rien archiver', async () => {
    const { controller, chatMessages } = build({ hold: true })
    await expect(controller.deleteChatThread(USER, target)).rejects.toBeInstanceOf(ConflictException)
    expect(chatMessages.deleteThread).not.toHaveBeenCalled()
  })

  it('sans conservation, le retrait se fait comme avant', async () => {
    const { controller, chatMessages } = build()
    await expect(controller.deleteChatThread(USER, target)).resolves.toEqual({ messages: 3 })
    expect(chatMessages.deleteThread).toHaveBeenCalled()
  })
})

describe('deleteChatThread — #2430.12 le propriétaire DÉCLARÉ fait foi', () => {
  it('l’ouvreur d’un fil transféré à un collègue ne peut plus le retirer seul', async () => {
    const { controller, chatMessages, conversations } = build({ owner: 'u-2' })
    await expect(controller.deleteChatThread(USER, target)).rejects.toBeInstanceOf(ForbiddenException)
    expect(conversations.ownerOf).toHaveBeenCalledWith({ workspaceId: 'ws-1', userId: 'u-1', conversationId: CONV })
    expect(chatMessages.threadAuthor).not.toHaveBeenCalled()
  })
})

describe('listChatMessages — #2430.4 une version figée borne la lecture', () => {
  const query = (version?: number) =>
    ({ conversationId: CONV, accountId: null, limit: 50, version }) as ListChatMessagesDto

  it('lit LE MÊME fil, borné à la version', async () => {
    const bound = new Date('2026-09-22T19:00:00Z')
    const { controller, chatMessages, conversations } = build({ bound })
    await controller.listChatMessages(USER, query(2))
    expect(conversations.versionBound).toHaveBeenCalledWith('ws-1', CONV, 2)
    expect(chatMessages.listThread).toHaveBeenCalledWith(expect.objectContaining({ conversationId: CONV, upTo: bound }))
  })

  it('NON — une version inconnue est un 404, jamais le fil vivant', async () => {
    const { controller, chatMessages } = build({ bound: null })
    await expect(controller.listChatMessages(USER, query(9))).rejects.toBeInstanceOf(NotFoundException)
    expect(chatMessages.listThread).not.toHaveBeenCalled()
  })

  it('#1955.12 — portefeuille cloisonné : un fil qui cite un compte d’un collègue est refusé (403), rien servi', async () => {
    const { controller, chatMessages, conversations } = build({ visibility: 'restricted', citesOutside: true })
    await expect(controller.listChatMessages(USER, query())).rejects.toBeInstanceOf(ForbiddenException)
    expect(conversations.citesAccountOutside).toHaveBeenCalledWith(
      { workspaceId: 'ws-1', userId: 'u-1', conversationId: CONV },
      'u-1',
    )
    expect(chatMessages.listThread).not.toHaveBeenCalled()
  })

  it('#1955.12 — NON — portefeuille ouvert, ou gérant : aucune lecture de comptes en plus', async () => {
    const open = build({ visibility: 'open', citesOutside: true })
    await open.controller.listChatMessages(USER, query())
    expect(open.conversations.citesAccountOutside).not.toHaveBeenCalled()
    const manager = build({ visibility: 'restricted', citesOutside: true, role: 'owner' })
    await manager.controller.listChatMessages(USER, query())
    expect(manager.conversations.citesAccountOutside).not.toHaveBeenCalled()
  })

  it('sans version, aucune borne', async () => {
    const { controller, chatMessages } = build()
    await controller.listChatMessages(USER, query())
    expect(chatMessages.listThread).toHaveBeenCalledWith(expect.objectContaining({ upTo: null }))
  })

  // #1944.20 — le curseur de pagination (`before`), distinct de `version`
  // (`upTo` ci-dessus) : forward tel quel, jamais recalculé côté contrôleur.
  it('#1944.20 — before est transmis tel quel au service, distinct de version/upTo', async () => {
    const { controller, chatMessages } = build()
    const before = new Date('2026-09-20T10:00:00Z')
    await controller.listChatMessages(USER, {
      conversationId: CONV,
      accountId: null,
      limit: 50,
      before,
    } as ListChatMessagesDto)
    expect(chatMessages.listThread).toHaveBeenCalledWith(expect.objectContaining({ before, upTo: null }))
  })

  it('#1944.20 — sans before, aucun curseur de pagination (le fil vivant lit ses derniers messages)', async () => {
    const { controller, chatMessages } = build()
    await controller.listChatMessages(USER, query())
    expect(chatMessages.listThread).toHaveBeenCalledWith(expect.objectContaining({ before: null }))
  })
})
