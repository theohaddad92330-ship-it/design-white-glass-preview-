import { ChatPresenceEntity } from '../../database/entities/chat-presence.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { ChatPresenceService, PRESENCE_TTL_MS } from './chat-presence.service'

/**
 * #3086 — « afficher si une personne est sur une conversation » (Apricot
 * Labs, deux sièges, un même espace). Le battement écrit une ligne éphémère ;
 * la lecture rend qui d'AUTRE, dans le MÊME espace, a battu récemment sur le
 * MÊME fil — jamais l'appelant lui-même, jamais un fil ou un espace voisin.
 */

function row(partial: Partial<ChatPresenceEntity>): ChatPresenceEntity {
  return {
    id: 'row-1',
    workspace_id: 'ws-1',
    thread_key: '·:·',
    user_id: 'u-a',
    updated_at: new Date(),
    ...partial,
  }
}

describe('ChatPresenceService', () => {
  let presence: MockRepository<ChatPresenceEntity>
  let service: ChatPresenceService

  beforeEach(() => {
    presence = createMockRepository<ChatPresenceEntity>()
    service = new ChatPresenceService(presence as never)
  })

  describe('threadKeyOf', () => {
    it("encode le fil par défaut (les deux à null) en une clé TEXTE non nulle — l'upsert doit pouvoir la retrouver", () => {
      expect(service.threadKeyOf(null, null)).toBe('·:·')
    })

    it('distingue deux comptes, et un compte d’une conversation nommée', () => {
      expect(service.threadKeyOf('acc-1', null)).not.toBe(service.threadKeyOf('acc-2', null))
      expect(service.threadKeyOf(null, 'conv-1')).not.toBe(service.threadKeyOf('conv-1', null))
    })
  })

  describe('heartbeat', () => {
    it('upsert une ligne sur (espace, fil, membre) — jamais un doublon par battement', async () => {
      await service.heartbeat({
        userId: 'u-a',
        workspaceId: 'ws-1',
        accountId: 'acc-1',
        conversationId: null,
        isDemoWorkspace: false,
      })

      expect(presence.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: 'ws-1', thread_key: 'acc-1:·', user_id: 'u-a' }),
        { conflictPaths: ['workspace_id', 'thread_key', 'user_id'] },
      )
    })

    it("n'écrit RIEN dans l'espace de démonstration — un visiteur ne laisse aucune trace", async () => {
      await service.heartbeat({
        userId: 'u-a',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: null,
        isDemoWorkspace: true,
      })
      expect(presence.upsert).not.toHaveBeenCalled()
    })

    it('un battement illisible ne lève jamais — un signal de présence raté ne bloque aucun message', async () => {
      presence.upsert.mockRejectedValueOnce(new Error('boom'))
      await expect(
        service.heartbeat({
          userId: 'u-a',
          workspaceId: 'ws-1',
          accountId: null,
          conversationId: null,
          isDemoWorkspace: false,
        }),
      ).resolves.toBeUndefined()
    })
  })

  describe('activeMembers', () => {
    it('rend les AUTRES membres du même fil, jamais l’appelant lui-même', async () => {
      presence.find.mockResolvedValueOnce([row({ user_id: 'u-a' }), row({ user_id: 'u-b' })])
      presence.manager.query.mockResolvedValueOnce([
        { userId: 'u-b', firstName: 'Bedros', avatarUrl: 'https://cdn.example.test/bedros.png' },
      ])

      const members = await service.activeMembers({
        userId: 'u-a',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: null,
        isDemoWorkspace: false,
      })

      expect(members).toEqual([{ firstName: 'Bedros', avatarUrl: 'https://cdn.example.test/bedros.png' }])
      expect(presence.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspace_id: 'ws-1', thread_key: '·:·' }) }),
      )
    })

    it('la fenêtre de lecture est bornée à PRESENCE_TTL_MS — un battement plus vieux ne compte plus comme présent', async () => {
      const before = Date.now()
      presence.find.mockResolvedValueOnce([])
      await service.activeMembers({
        userId: 'u-a',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: null,
        isDemoWorkspace: false,
      })

      const [{ where }] = presence.find.mock.calls[0] as [{ where: { updated_at: { value: Date } } }]
      const cutoff = where.updated_at.value.getTime()
      expect(before - cutoff).toBeGreaterThanOrEqual(PRESENCE_TTL_MS - 5)
      expect(before - cutoff).toBeLessThan(PRESENCE_TTL_MS + 5_000)
    })

    it('sans autre membre actif, rend [] — jamais une requête d’auteurs pour une liste vide', async () => {
      presence.find.mockResolvedValueOnce([row({ user_id: 'u-a' })])

      const members = await service.activeMembers({
        userId: 'u-a',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: null,
        isDemoWorkspace: false,
      })

      expect(members).toEqual([])
      expect(presence.manager.query).not.toHaveBeenCalled()
    })

    it('une lecture illisible rend [] — l’écran s’affiche sans nom plutôt que de casser', async () => {
      presence.find.mockRejectedValueOnce(new Error('boom'))
      const members = await service.activeMembers({
        userId: 'u-a',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: null,
        isDemoWorkspace: false,
      })
      expect(members).toEqual([])
    })

    it('en démonstration, rend TOUJOURS un membre fictif — la recette du retour (#3086)', async () => {
      const members = await service.activeMembers({
        userId: 'u-a',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: null,
        isDemoWorkspace: true,
      })
      expect(members).toEqual([{ firstName: 'Camille', avatarUrl: null }])
      expect(presence.find).not.toHaveBeenCalled()
    })
  })
})
