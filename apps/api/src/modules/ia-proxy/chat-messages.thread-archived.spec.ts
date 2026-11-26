import { IsNull, Not } from 'typeorm'
import type { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { createMockRepository } from '../../database/test-utils'
import { ChatMessagesService } from './chat-messages.service'

/**
 * #1954 — un fil RANGÉ masque ses documents « fil seul » à la récupération, et
 * le ressortir les rend (décision de Louis, 12/09/2026). La question « ce fil
 * est-il rangé ? » se pose sur la clé du fil — la MÊME que celle de
 * `setThreadArchived` —, jamais sur une autre lecture qui divergerait.
 */
describe('ChatMessagesService.isThreadArchived (#1954)', () => {
  it('lit le fil par sa clé dans CET espace, et une estampille posée', async () => {
    const repo = createMockRepository<ChatMessageEntity>()
    repo.count.mockResolvedValueOnce(2)
    const service = new ChatMessagesService(repo as never)

    const archived = await service.isThreadArchived({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'c-A',
    })

    expect(archived).toBe(true)
    expect(repo.count).toHaveBeenCalledWith({
      where: { workspace_id: 'ws-1', conversation_id: 'c-A', archived_at: Not(IsNull()) },
    })
  })

  it('un fil vivant — aucune estampille — n’est pas rangé', async () => {
    const repo = createMockRepository<ChatMessageEntity>()
    repo.count.mockResolvedValueOnce(0)
    const service = new ChatMessagesService(repo as never)

    expect(
      await service.isThreadArchived({ userId: 'u-1', workspaceId: 'ws-1', accountId: null, conversationId: 'c-A' }),
    ).toBe(false)
  })
})

/**
 * #2430.9 — « Supprimer » une conversation ARCHIVE, elle ne disparaît pas.
 *
 * Jusqu'ici `deleteThread` faisait un DELETE SQL : les messages disparaissaient
 * pour de bon, contre la doctrine du dépôt (« on archive, on ne supprime pas »).
 * Décision de Louis du 20/09/2026 (QCM) : ce geste réutilise désormais
 * `setThreadArchived` (#1120), le mécanisme d'archivage EXISTANT (GA-26).
 *
 * Le test qui compte n'est pas « l'appel réussit » : c'est que LA LIGNE EXISTE
 * ENCORE après le geste, avec son `archived_at` posé — un `jest.fn()` pur
 * (`createMockRepository`) n'a pas d'état et ne le prouverait pas, d'où le faux
 * dépôt ci-dessous, qui retient VRAIMENT ses lignes entre un `.update` et un
 * `.findOne`.
 */
function fakeStatefulMessagesRepo(rows: Array<Record<string, unknown>>) {
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => row[key] === value)
  return {
    update: jest.fn(async (where: Record<string, unknown>, patch: Record<string, unknown>) => {
      const hit = rows.filter(row => matches(row, where))
      hit.forEach(row => Object.assign(row, patch))
      return { affected: hit.length }
    }),
    delete: jest.fn(async (where: Record<string, unknown>) => {
      const before = rows.length
      const kept = rows.filter(row => !matches(row, where))
      rows.length = 0
      rows.push(...kept)
      return { affected: before - rows.length }
    }),
    findOne: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) => rows.find(row => matches(row, where)) ?? null,
    ),
  }
}

describe('ChatMessagesService.deleteThread archive au lieu de supprimer (#2430.9)', () => {
  it('après le geste, la ligne existe encore en base avec son archived_at posé', async () => {
    const rows = [{ id: 'm-1', workspace_id: 'ws-1', conversation_id: 'c-A', account_id: null, archived_at: null }]
    const repo = fakeStatefulMessagesRepo(rows)
    const service = new ChatMessagesService(repo as never)

    const affected = await service.deleteThread({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'c-A',
    })

    expect(affected).toBe(1)
    // Le point du ticket : plus de DELETE SQL sur ce chemin.
    expect(repo.delete).not.toHaveBeenCalled()
    const survivor = await repo.findOne({ where: { workspace_id: 'ws-1', conversation_id: 'c-A' } })
    expect(survivor).not.toBeNull()
    expect((survivor as { archived_at: Date | null })?.archived_at).toBeInstanceOf(Date)
  })
})
