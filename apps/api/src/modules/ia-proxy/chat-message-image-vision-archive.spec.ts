import { ChatMessagesService } from './chat-messages.service'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #2876 (décision Louis 14/10) — ARCHIVER, pas supprimer. Les zones vision
 * (`regions`/`objects`) d'une image dont la rétention est dépassée sortent de
 * toute lecture (affichage, et tout futur appelant modèle), mais la LIGNE
 * reste en base intacte — `image_vision_archived_at` est le seul état qui
 * tranche.
 */
describe('#2876 (décision Louis 14/10) — archivage des zones vision expirées', () => {
  const USER = 'u-1'
  const WORKSPACE = 'ws-1'
  const IMAGE = 'img-1'
  const region = { quote: 'Total HT 1 250,00', bounding_box: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 } }

  let repo: MockRepository<ChatMessageEntity>
  let service: ChatMessagesService

  beforeEach(() => {
    repo = createMockRepository<ChatMessageEntity>()
    service = new ChatMessagesService(repo as never)
  })

  describe('listThread — la lecture respecte l’archivage', () => {
    it('rend les zones et objets intacts quand `image_vision_archived_at` est `null`', async () => {
      repo.find.mockResolvedValueOnce([
        {
          id: 'm-1',
          role: 'user',
          content: 'Voici une capture',
          created_at: new Date(),
          image_attachments: [{ id: IMAGE, name: 'facture.png', regions: [region] }],
          image_vision_archived_at: null,
        } as never,
      ])

      const [message] = await service.listThread({
        userId: USER,
        workspaceId: WORKSPACE,
        accountId: null,
        conversationId: 'conv-1',
        limit: 50,
      })

      expect(message.image_attachments).toEqual([{ id: IMAGE, name: 'facture.png', regions: [region] }])
    })

    it('sait dire NON : une fois archivé, un stub `{id, name}` seul — jamais `regions` ni `objects`', async () => {
      const archivedAt = new Date('2026-10-14T03:41:00Z')
      repo.find.mockResolvedValueOnce([
        {
          id: 'm-1',
          role: 'user',
          content: 'Voici une capture',
          created_at: new Date('2026-09-01T09:00:00Z'),
          image_attachments: [
            { id: IMAGE, name: 'facture.png', regions: [region], objects: { documentBounds: null, table: null } },
          ],
          image_vision_archived_at: archivedAt,
        } as never,
      ])

      const [message] = await service.listThread({
        userId: USER,
        workspaceId: WORKSPACE,
        accountId: null,
        conversationId: 'conv-1',
        limit: 50,
      })

      expect(message.image_attachments).toEqual([{ id: IMAGE, name: 'facture.png' }])
    })

    it('un message sans image n’est pas affecté', async () => {
      repo.find.mockResolvedValueOnce([
        {
          id: 'm-1',
          role: 'user',
          content: 'Question sans image',
          created_at: new Date(),
          image_attachments: null,
          image_vision_archived_at: null,
        } as never,
      ])

      const [message] = await service.listThread({
        userId: USER,
        workspaceId: WORKSPACE,
        accountId: null,
        conversationId: 'conv-1',
        limit: 50,
      })

      expect(message.image_attachments).toBeNull()
    })
  })

  describe('archiveExpiredImageVision — le job nocturne, idempotent', () => {
    it('pose `image_vision_archived_at` sur les messages dont l’image a dépassé 30 jours, jamais sur les autres', async () => {
      repo.manager.query.mockResolvedValueOnce([{ id: 'm-1' }, { id: 'm-2' }])

      const result = await service.archiveExpiredImageVision('2026-10-14', 500)

      expect(result).toEqual({ archived: 2 })
      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('UPDATE chat_messages')
      expect(sql).toContain('SET image_vision_archived_at = now()')
      expect(sql).toContain('image_vision_archived_at IS NULL')
      expect(sql).not.toContain('DELETE')
      expect(params).toEqual(['2026-10-14', 30, 500])
    })

    it('lit la forme que TypeORM rend pour un UPDATE … RETURNING — `[lignes, nombre]`, jamais `lignes.length`', async () => {
      repo.manager.query.mockResolvedValueOnce([[{ id: 'm-1' }, { id: 'm-2' }, { id: 'm-3' }], 3])

      expect(await service.archiveExpiredImageVision('2026-10-14', 500)).toEqual({ archived: 3 })

      // Rien d'échu : le couple vaut `[[], 0]`, de longueur 2 — compter son `length` dirait 2.
      repo.manager.query.mockResolvedValueOnce([[], 0])
      expect(await service.archiveExpiredImageVision('2026-10-14', 500)).toEqual({ archived: 0 })
    })

    it('rien d’échu : zéro ligne archivée, aucune erreur', async () => {
      repo.manager.query.mockResolvedValueOnce([])

      const result = await service.archiveExpiredImageVision('2026-10-14', 500)

      expect(result).toEqual({ archived: 0 })
    })
  })
})
