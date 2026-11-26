import type { Repository } from 'typeorm'
import { InternalChatTurnsListController } from './internal-chat-turns-list.controller'
import type { ChatMessageEntity } from '../../database/entities/chat-message.entity'

/** #3391 — la liste des tours de Laura : jamais un corps de message, page bornée à 50. */
describe('InternalChatTurnsListController', () => {
  function make(rows: unknown[] = []) {
    const query = jest.fn().mockResolvedValue(rows)
    return {
      controller: new InternalChatTurnsListController({ query } as unknown as Repository<ChatMessageEntity>),
      query,
    }
  }

  it('rend date, espace, nombre de messages et outils — rien d’autre', async () => {
    const { controller } = make([
      {
        turn_id: 't1',
        workspace_id: 'w1',
        workspace_name: 'Apricot',
        started_at: new Date('2026-10-04T08:00:00.000Z'),
        message_count: 2,
        tools: ['get_pipeline'],
      },
    ])
    const out = await controller.list()
    expect(out).toEqual([
      {
        turnId: 't1',
        workspaceId: 'w1',
        workspaceName: 'Apricot',
        startedAt: '2026-10-04T08:00:00.000Z',
        messageCount: 2,
        toolsCalled: ['get_pipeline'],
      },
    ])
    expect(JSON.stringify(out)).not.toContain('content')
  })

  it('SAIT DIRE NON : la requête ne sélectionne jamais le corps d’un message', async () => {
    const { controller, query } = make()
    await controller.list()
    const sql = String(query.mock.calls[0][0])
    expect(sql).not.toMatch(/\bm2?\.content\b/)
    expect(sql).not.toMatch(/SELECT[^F]*content/i)
  })

  it('borne la page à 50, 25 par défaut, et filtre par espace', async () => {
    const { controller, query } = make()
    await controller.list(undefined, 9999, 10)
    expect(query.mock.calls[0][1]).toEqual([50, 10])
    await controller.list()
    expect(query.mock.calls[1][1]).toEqual([25, 0])
    await controller.list('11111111-1111-4111-8111-111111111111')
    expect(query.mock.calls[2][1]).toEqual(['11111111-1111-4111-8111-111111111111', 25, 0])
    expect(String(query.mock.calls[2][0])).toContain('m.workspace_id = $1')
  })

  it('un tour sans outil rend une liste vide, jamais null', async () => {
    const { controller } = make([
      {
        turn_id: 't',
        workspace_id: null,
        workspace_name: null,
        started_at: '2026-10-04T08:00:00Z',
        message_count: '1',
        tools: null,
      },
    ])
    expect((await controller.list())[0].toolsCalled).toEqual([])
  })
})
