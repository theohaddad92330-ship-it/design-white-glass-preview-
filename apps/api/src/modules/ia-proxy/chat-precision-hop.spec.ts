import { IsNull, MoreThanOrEqual, Not } from 'typeorm'
import { ChatMessagesService } from './chat-messages.service'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * Le saut de précision : le message qui RÉPOND à une question de Laura ne
 * compte pas contre le plafond quotidien.
 *
 * Ce que ces tests tiennent, dans l'ordre d'importance :
 *  1. **un message ordinaire compte toujours** — c'est le seul vrai risque du
 *     lot, une exonération qui déborde ;
 *  2. le marquage vient de la SOURCE (`ask_clarification`), jamais d'une
 *     relecture du texte ;
 *  3. un seul saut par fil et par fenêtre — sinon un fil qui tourne en rond ne
 *     consommerait rien ;
 *  4. l'isolation par `user_id`, sans exception : un fil est une ressource
 *     d'équipe, un plafond ne l'est pas.
 */
describe('saut de précision — ce que le plafond ne compte pas', () => {
  let service: ChatMessagesService
  let repo: MockRepository<ChatMessageEntity>

  const thread = { userId: 'u-1', workspaceId: 'ws-1', accountId: 'a-1', conversationId: null }

  beforeEach(() => {
    repo = createMockRepository<ChatMessageEntity>()
    service = new ChatMessagesService(repo as never)
    repo.save.mockImplementation(async (entity: Partial<ChatMessageEntity>) => ({
      id: 'm-new',
      created_at: new Date(),
      ...entity,
    }))
  })

  describe('measureUserMessagesSince', () => {
    it('rend le brut ET les sauts, tous deux bornés au même utilisateur', async () => {
      repo.count.mockResolvedValueOnce(40).mockResolvedValueOnce(3)
      const since = new Date('2026-08-29T10:00:00Z')

      const measured = await service.measureUserMessagesSince('u-1', since)

      expect(measured).toEqual({ total: 40, exempt: 3 })
      for (const call of repo.count.mock.calls) {
        const where = (call[0] as { where: Record<string, unknown> }).where
        expect(where).toMatchObject({ user_id: 'u-1', role: 'user' })
        expect(where['created_at']).toEqual(MoreThanOrEqual(since))
      }
      const exemptWhere = (repo.count.mock.calls[1][0] as { where: Record<string, unknown> }).where
      expect(exemptWhere['quota_exempt_at']).toEqual(Not(IsNull()))
    })
  })

  describe('markPrecisionRequest — le marquage à la source', () => {
    it('estampille le DERNIER message de CET utilisateur dans CE fil', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'm-7', precision_request_at: null } as ChatMessageEntity)

      const marked = await service.markPrecisionRequest(thread)

      expect(marked).toBe(true)
      const where = (repo.findOne.mock.calls[0][0] as { where: Record<string, unknown> }).where
      expect(where).toMatchObject({ user_id: 'u-1', role: 'user', workspace_id: 'ws-1', account_id: 'a-1' })
      expect(repo.update).toHaveBeenCalledWith({ id: 'm-7' }, { precision_request_at: expect.any(Date) })
    })

    it("ne marque rien quand le fil n'a encore aucun message de cet utilisateur", async () => {
      repo.findOne.mockResolvedValueOnce(null)

      expect(await service.markPrecisionRequest(thread)).toBe(false)
      expect(repo.update).not.toHaveBeenCalled()
    })

    it('ne re-marque pas un message déjà marqué', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'm-7',
        precision_request_at: new Date(),
      } as ChatMessageEntity)

      expect(await service.markPrecisionRequest(thread)).toBe(false)
      expect(repo.update).not.toHaveBeenCalled()
    })
  })

  /**
   * #1953.19 — un tour qui n'a RIEN RENDU ne se facture pas (tranché Louis
   * 16/09/2026). Même champ, même message, même soustraction que le saut de
   * précision : c'est une RÉGULARISATION, pas un second compteur.
   */
  describe('releaseQuotaForUnrenderedTurn — la régularisation d’un tour sans réponse', () => {
    it('exonère le DERNIER message de CET utilisateur dans CE fil', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'm-9', quota_exempt_at: null } as ChatMessageEntity)

      expect(await service.releaseQuotaForUnrenderedTurn(thread)).toBe(true)

      const where = (repo.findOne.mock.calls[0][0] as { where: Record<string, unknown> }).where
      expect(where).toMatchObject({ user_id: 'u-1', role: 'user', workspace_id: 'ws-1', account_id: 'a-1' })
      expect(repo.update).toHaveBeenCalledWith({ id: 'm-9' }, { quota_exempt_at: expect.any(Date) })
    })

    it('n’exonère rien quand le fil n’a aucun message de cet utilisateur', async () => {
      repo.findOne.mockResolvedValueOnce(null)

      expect(await service.releaseQuotaForUnrenderedTurn(thread)).toBe(false)
      expect(repo.update).not.toHaveBeenCalled()
    })

    it('TÉMOIN — un message déjà exonéré ne l’est pas deux fois', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'm-9', quota_exempt_at: new Date() } as ChatMessageEntity)

      expect(await service.releaseQuotaForUnrenderedTurn(thread)).toBe(false)
      expect(repo.update).not.toHaveBeenCalled()
    })
  })

  /**
   * #4540 — « garde #2650.2 » : le plafond n'est JAMAIS débité d'un échec côté assistant, et la
   * régularisation est SYNCHRONE. Le navigateur n'écrit la question qu'après l'acceptation du tour :
   * à l'instant où le flux casse, elle peut ne pas encore exister. Régulariser « le dernier message »
   * exonérait alors la question D'AVANT (ou rien, au premier tour d'un fil) — la question échouée,
   * écrite juste après, restait comptée.
   */
  describe('releaseQuotaForUnrenderedTurn — #4540, la question échouée et non la précédente', () => {
    const turnStartedAt = new Date('2026-10-25T10:00:00Z')

    it('exonère le message né PENDANT ce tour', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'm-now',
        quota_exempt_at: null,
        created_at: new Date('2026-10-25T10:00:01Z'),
      } as ChatMessageEntity)

      expect(await service.releaseQuotaForUnrenderedTurn({ ...thread, turnStartedAt })).toBe(true)
      expect(repo.update).toHaveBeenCalledWith({ id: 'm-now' }, { quota_exempt_at: expect.any(Date) })
    })

    it('SAIT DIRE NON : ne touche JAMAIS la question du tour d’avant', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'm-previous',
        quota_exempt_at: null,
        created_at: new Date('2026-10-25T09:55:00Z'),
      } as ChatMessageEntity)

      await service.releaseQuotaForUnrenderedTurn({ ...thread, turnStartedAt })

      expect(repo.update).not.toHaveBeenCalled()
    })

    it('la question pas encore écrite naît exonérée — une seule fois, pour CE fil et CET utilisateur', async () => {
      repo.findOne.mockResolvedValue(null)
      await service.releaseQuotaForUnrenderedTurn({ ...thread, turnStartedAt: new Date() })

      await service.create({ ...thread, userId: 'u-2', role: 'user', content: 'collègue' })
      expect(repo.create).toHaveBeenLastCalledWith(expect.objectContaining({ quota_exempt_at: null }))

      await service.create({ ...thread, role: 'user', content: 'la question échouée' })
      expect(repo.create).toHaveBeenLastCalledWith(expect.objectContaining({ quota_exempt_at: expect.any(Date) }))

      await service.create({ ...thread, role: 'user', content: 'la suivante compte' })
      expect(repo.create).toHaveBeenLastCalledWith(expect.objectContaining({ quota_exempt_at: null }))
    })

    it('une réponse de Laura n’est jamais exonérée par ce mécanisme', async () => {
      repo.findOne.mockResolvedValue(null)
      await service.releaseQuotaForUnrenderedTurn({ ...thread, turnStartedAt: new Date() })

      await service.create({ ...thread, role: 'assistant', content: 'réponse' })

      expect(repo.create).toHaveBeenLastCalledWith(expect.objectContaining({ quota_exempt_at: null }))
    })
  })

  describe('create — qui hérite du marquage, et qui ne l’hérite pas', () => {
    it('UN MESSAGE ORDINAIRE COMPTE : rien n’est marqué, rien n’est exonéré', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'm-7', precision_request_at: null } as ChatMessageEntity)

      await service.create({ ...thread, role: 'user', content: 'analyse Michelin' })

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ quota_exempt_at: null }))
    })

    it('LE PREMIER MESSAGE d’un fil compte : il ne répond à aucune question', async () => {
      repo.findOne.mockResolvedValueOnce(null)

      await service.create({ ...thread, role: 'user', content: 'salut' })

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ quota_exempt_at: null }))
    })

    it('la réponse à une question marquée par Laura ne compte pas', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'm-7',
        precision_request_at: new Date(),
      } as ChatMessageEntity)
      repo.count.mockResolvedValueOnce(0)

      await service.create({ ...thread, role: 'user', content: 'le 44, un recrutement en cours' })

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ quota_exempt_at: expect.any(Date) }))
    })

    it('UN SEUL SAUT par fil et par fenêtre — le second aller-retour se paie', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'm-9',
        precision_request_at: new Date(),
      } as ChatMessageEntity)
      repo.count.mockResolvedValueOnce(1) // un saut déjà accordé dans ce fil

      await service.create({ ...thread, role: 'user', content: 'plutôt la data science' })

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ quota_exempt_at: null }))
    })

    it("une réponse de Laura n'est jamais exonérée — le plafond ne compte que l'utilisateur", async () => {
      await service.create({ ...thread, role: 'assistant', content: 'Sur quel département ?' })

      expect(repo.findOne).not.toHaveBeenCalled()
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ quota_exempt_at: null }))
    })

    it('une base qui ne répond pas ne donne pas un saut : le message compte', async () => {
      repo.findOne.mockRejectedValueOnce(new Error('db down'))

      await service.create({ ...thread, role: 'user', content: 'et pour Vinci ?' })

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ quota_exempt_at: null }))
    })
  })
})
