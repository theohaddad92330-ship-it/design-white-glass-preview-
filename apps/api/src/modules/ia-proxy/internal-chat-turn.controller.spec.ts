import { NotFoundException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { InternalChatTurnController } from './internal-chat-turn.controller'
import type { ChatMessageEntity } from '../../database/entities/chat-message.entity'

/**
 * #2905 (#2442.16) — REPLAY EN LECTURE SEULE d'un tour de Laura. La route ne
 * fait qu'une LECTURE de `chat_messages` : aucun outil n'est invoqué, aucun
 * crédit n'est débité, aucun message ne sort — vrai par construction (aucune
 * écriture n'existe dans ce contrôleur).
 */
describe('InternalChatTurnController', () => {
  function makeController(rows: Partial<ChatMessageEntity>[]) {
    const find = jest.fn().mockResolvedValue(rows)
    const messages = { find } as unknown as Repository<ChatMessageEntity>
    return { controller: new InternalChatTurnController(messages), find }
  }

  it('rend les messages du tour, dans l’ordre chronologique, sans toucher à aucun outil', async () => {
    const createdAt = new Date('2026-09-26T10:00:00.000Z')
    const { controller, find } = makeController([
      {
        id: 'm1',
        role: 'user',
        content: 'Relance TF1 ?',
        created_at: createdAt,
        context: null,
        attachments: null,
      },
      {
        id: 'm2',
        role: 'assistant',
        content: 'Voici la relance proposée.',
        created_at: new Date('2026-09-26T10:00:02.000Z'),
        context: { sources: [] } as unknown as ChatMessageEntity['context'],
        attachments: [{ id: 'doc-1', name: 'brief.pdf' }],
      },
    ])

    const replay = await controller.replay('turn-1')

    expect(find).toHaveBeenCalledWith({ where: { turn_id: 'turn-1' }, order: { created_at: 'ASC' } })
    expect(replay).toEqual([
      {
        id: 'm1',
        role: 'user',
        content: 'Relance TF1 ?',
        createdAt: createdAt.toISOString(),
        context: null,
        attachments: null,
      },
      {
        id: 'm2',
        role: 'assistant',
        content: 'Voici la relance proposée.',
        createdAt: '2026-09-26T10:00:02.000Z',
        context: { sources: [] },
        attachments: [{ id: 'doc-1', name: 'brief.pdf' }],
      },
    ])
  })

  it('un tour introuvable rend 404, jamais une liste vide silencieuse', async () => {
    const { controller } = makeController([])
    await expect(controller.replay('inconnu')).rejects.toThrow(NotFoundException)
  })
})
