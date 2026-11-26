import { In, IsNull, Not } from 'typeorm'
import type { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { ChatMessagesService } from './chat-messages.service'

/**
 * #1943.1 — `chat_messages.turn_id` : la moitié « fil » de la clé d'une carte.
 *
 * Deux fonctions, et elles restent SÉPARÉES de la lecture du fil (`listThread`),
 * que d'autres lots enrichissent en parallèle (titres, auteurs, pièces jointes).
 */

const TURN = '33333333-3333-4333-8333-333333333333'

describe('ChatMessagesService — le tour d’un message', () => {
  let service: ChatMessagesService
  let repo: MockRepository<ChatMessageEntity>

  beforeEach(() => {
    repo = createMockRepository<ChatMessageEntity>()
    repo.create.mockImplementation((row: Partial<ChatMessageEntity>) => row as ChatMessageEntity)
    repo.save.mockImplementation(
      async (row: Partial<ChatMessageEntity>) =>
        ({
          id: 'm-1',
          created_at: new Date(),
          ...row,
        }) as ChatMessageEntity,
    )
    service = new ChatMessagesService(repo as never)
  })

  it('`create` écrit le tour quand l’appelant le fournit, `null` sinon (tout l’existant)', async () => {
    const base = { userId: 'u-1', workspaceId: 'ws-1', accountId: null, conversationId: 'conv-1' }
    await service.create({ ...base, role: 'assistant', content: 'Je te propose deux actions.', turnId: TURN })
    expect(repo.create).toHaveBeenLastCalledWith(expect.objectContaining({ turn_id: TURN }))

    await service.create({ ...base, role: 'assistant', content: 'Bonjour.' })
    expect(repo.create).toHaveBeenLastCalledWith(expect.objectContaining({ turn_id: null }))
  })

  it('`turnIdsOf` lit les tours des messages DE L’ESPACE, et seulement ceux qui en portent un', async () => {
    repo.find.mockResolvedValue([{ id: 'm-2', turn_id: TURN }] as ChatMessageEntity[])
    const turns = await service.turnIdsOf('ws-1', ['m-1', 'm-2'])
    expect(repo.find).toHaveBeenCalledWith({
      where: { workspace_id: 'ws-1', id: In(['m-1', 'm-2']), turn_id: Not(IsNull()) },
      select: ['id', 'turn_id'],
    })
    expect([...turns]).toEqual([['m-2', TURN]])
  })

  it('sans message à lire, aucune requête', async () => {
    expect((await service.turnIdsOf('ws-1', [])).size).toBe(0)
    expect(repo.find).not.toHaveBeenCalled()
  })
})
