import { ChatMessagesService } from './chat-messages.service'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #1953.11 / #1953.22 — LA PROVENANCE D'UNE BRANCHE EST UNE DONNÉE, PAS UN ÉTAT
 * DE SESSION.
 *
 * Défaut mesuré en production le 16/09/2026 (SHA servi 4897da487) : « Modifier
 * ma demande » étiquetait la réponse abandonnée « Réponse remplacée à 15:05 —
 * conservée pour mémoire », puis un rechargement complet de la page faisait
 * disparaître l'étiquette — zéro élément du DOM portant « remplac ». Les deux
 * échanges se retrouvaient côte à côte, sans rien qui dise que le second est
 * une réédition du premier.
 *
 * Ce que ces tests tiennent :
 *  1. la réponse abandonnée est ESTAMPILLÉE, jamais réécrite ni effacée — « on
 *     archive, on ne supprime pas » ;
 *  2. l'estampille est bornée à l'ESPACE de l'appelant : on n'estampille pas le
 *     fil d'une autre ESN ;
 *  3. une réponse déjà remplacée ne l'est pas deux fois (la première heure est
 *     la vraie) ;
 *  4. la réponse qui arrive porte le lien vers celle dont elle repart, et sa
 *     nature ;
 *  5. TÉMOIN — un message ordinaire n'écrit AUCUN de ces champs.
 */
describe('#1953.11 / #1953.22 — la provenance d’une branche, persistée', () => {
  let service: ChatMessagesService
  let repo: MockRepository<ChatMessageEntity>

  beforeEach(() => {
    repo = createMockRepository<ChatMessageEntity>()
    service = new ChatMessagesService(repo as never)
    repo.save.mockImplementation(async (entity: Partial<ChatMessageEntity>) => ({
      id: 'm-new',
      created_at: new Date('2026-09-16T15:07:00Z'),
      ...entity,
    }))
  })

  describe('markSuperseded — la réponse qu’on abandonne', () => {
    it('estampille la réponse, dans l’espace de l’appelant, sans toucher son texte', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'm-1', superseded_at: null } as ChatMessageEntity)

      const stamped = await service.markSuperseded({ workspaceId: 'ws-1', messageId: 'm-1' })

      expect(stamped).toBeInstanceOf(Date)
      const where = (repo.findOne.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where
      expect(where).toMatchObject({ id: 'm-1', workspace_id: 'ws-1', role: 'assistant' })
      expect(repo.update).toHaveBeenCalledWith({ id: 'm-1' }, { superseded_at: expect.any(Date) })
      const written = repo.update.mock.calls[0]?.[1] as Record<string, unknown>
      expect(Object.keys(written)).toEqual(['superseded_at'])
    })

    it('n’estampille RIEN quand la réponse n’est pas dans cet espace', async () => {
      repo.findOne.mockResolvedValueOnce(null)

      expect(await service.markSuperseded({ workspaceId: 'ws-autre', messageId: 'm-1' })).toBeNull()
      expect(repo.update).not.toHaveBeenCalled()
    })

    it('garde la PREMIÈRE heure — une réponse déjà remplacée ne l’est pas deux fois', async () => {
      const first = new Date('2026-09-16T15:05:00Z')
      repo.findOne.mockResolvedValueOnce({ id: 'm-1', superseded_at: first } as ChatMessageEntity)

      expect(await service.markSuperseded({ workspaceId: 'ws-1', messageId: 'm-1' })).toEqual(first)
      expect(repo.update).not.toHaveBeenCalled()
    })
  })

  describe('create — la réponse qui repart d’une autre', () => {
    it('écrit le lien et la nature de la branche, ET estampille la réponse remplacée', async () => {
      // La réponse d'origine EXISTE dans cet espace : c'est ce que le service
      // relit avant d'écrire le lien.
      repo.findOne.mockResolvedValueOnce({ id: 'm-1', superseded_at: null } as ChatMessageEntity)

      const saved = await service.create({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: 'c-1',
        role: 'assistant',
        content: 'la réponse rejouée',
        branchOfMessageId: 'm-1',
        branchKind: 'edit',
      })

      const written = repo.create.mock.calls[0]?.[0] as Record<string, unknown>
      expect(written).toMatchObject({ branch_of_message_id: 'm-1', branch_kind: 'edit' })
      expect(saved).toMatchObject({ branch_of_message_id: 'm-1', branch_kind: 'edit' })
      // Les deux faces du MÊME fait : « celle-ci repart de m-1 » et « m-1 a été
      // remplacée ». Elles se posent ensemble, jamais l'une sans l'autre.
      expect(repo.update).toHaveBeenCalledWith({ id: 'm-1' }, { superseded_at: expect.any(Date) })
    })

    it('n’écrit AUCUN lien vers une réponse d’un autre espace', async () => {
      repo.findOne.mockResolvedValueOnce(null)

      await service.create({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: 'c-1',
        role: 'assistant',
        content: 'la réponse rejouée',
        branchOfMessageId: 'm-dune-autre-esn',
        branchKind: 'edit',
      })

      const written = repo.create.mock.calls[0]?.[0] as Record<string, unknown>
      expect(written['branch_of_message_id']).toBeNull()
      expect(written['branch_kind']).toBeNull()
      // Et rien n'est estampillé dans l'autre espace.
      expect(repo.update).not.toHaveBeenCalled()
    })

    it('TÉMOIN — un message ordinaire ne porte aucune branche', async () => {
      await service.create({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: 'c-1',
        role: 'user',
        content: 'une question tapée',
      })

      const written = repo.create.mock.calls[0]?.[0] as Record<string, unknown>
      expect(written['branch_of_message_id']).toBeNull()
      expect(written['branch_kind']).toBeNull()
      expect(written['superseded_at']).toBeUndefined()
    })
  })

  describe('listThread — ce que le rechargement retrouve', () => {
    it('rend les trois champs, pour que l’écran puisse redire ce qui s’est passé', async () => {
      const supersededAt = new Date('2026-09-16T15:05:00Z')
      repo.find.mockResolvedValueOnce([
        {
          id: 'm-2',
          user_id: null,
          account_id: null,
          conversation_id: 'c-1',
          role: 'assistant',
          content: 'la réponse rejouée',
          created_at: new Date('2026-09-16T15:07:00Z'),
          voice_object_id: null,
          superseded_at: null,
          branch_of_message_id: 'm-1',
          branch_kind: 'edit',
        },
        {
          id: 'm-1',
          user_id: null,
          account_id: null,
          conversation_id: 'c-1',
          role: 'assistant',
          content: 'la première réponse',
          created_at: new Date('2026-09-16T15:02:00Z'),
          voice_object_id: null,
          superseded_at: supersededAt,
          branch_of_message_id: null,
          branch_kind: null,
        },
      ] as ChatMessageEntity[])

      const thread = await service.listThread({
        userId: 'u-1',
        workspaceId: 'ws-1',
        accountId: null,
        conversationId: 'c-1',
        limit: 50,
      })

      // La lecture sélectionne explicitement ses colonnes : sans ces trois-là,
      // la donnée n'atteint jamais l'écran (le défaut de famille de ce dépôt —
      // du code juste que personne ne lit).
      const select = (repo.find.mock.calls[0]?.[0] as { select: string[] }).select
      expect(select).toEqual(expect.arrayContaining(['superseded_at', 'branch_of_message_id', 'branch_kind']))

      expect(thread[0]).toMatchObject({ id: 'm-1', superseded_at: supersededAt })
      expect(thread[1]).toMatchObject({ id: 'm-2', branch_of_message_id: 'm-1', branch_kind: 'edit' })
    })
  })
})
