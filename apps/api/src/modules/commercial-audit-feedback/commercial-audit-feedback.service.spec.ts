import { CommercialAuditFeedbackService } from './commercial-audit-feedback.service'

function serviceWith(rows: unknown[] = []) {
  const find = jest.fn().mockResolvedValue(rows)
  const insert = jest.fn().mockResolvedValue(undefined)
  const service = new CommercialAuditFeedbackService({ find, insert } as never)
  return { service, find, insert }
}

describe('CommercialAuditFeedbackService — #2075.12 / #2075.13', () => {
  describe('create', () => {
    it('#2075.12 — insère un commentaire avec son texte', async () => {
      const { service, insert } = serviceWith()

      await service.create('u1', 'ws1', { target_key: 'bottleneck', kind: 'comment', comment_text: 'À revoir.' })

      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'u1',
          workspace_id: 'ws1',
          target_key: 'bottleneck',
          kind: 'comment',
          comment_text: 'À revoir.',
        }),
      )
    })

    it('#2075.13 — insère un refus SANS texte, jamais un texte deviné', async () => {
      const { service, insert } = serviceWith()

      await service.create('u1', 'ws1', { target_key: 'stop', kind: 'refused' })

      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'u1', target_key: 'stop', kind: 'refused', comment_text: null }),
      )
    })

    it('#2075.14 — insère la validation d’UN bloc, SANS texte', async () => {
      const { service, insert } = serviceWith()

      await service.create('u1', 'ws1', { target_key: 'consequence:accounts', kind: 'validated' })

      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ target_key: 'consequence:accounts', kind: 'validated', comment_text: null }),
      )
    })

    it('accepte `workspaceId: null` — un espace non résolu n’empêche jamais la note', async () => {
      const { service, insert } = serviceWith()

      await service.create('u1', null, { target_key: 'stop', kind: 'refused' })

      expect(insert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: null }))
    })
  })

  describe('listForUser — la note la plus RÉCENTE par cible', () => {
    it('rend un enregistrement par `target_key`, indexé par cette même clé', async () => {
      const { service } = serviceWith([
        {
          target_key: 'bottleneck',
          kind: 'comment',
          comment_text: 'À revoir.',
          created_at: new Date('2026-09-26T10:00:00.000Z'),
        },
        { target_key: 'stop', kind: 'refused', comment_text: null, created_at: new Date('2026-09-26T09:00:00.000Z') },
      ])

      const result = await service.listForUser('u1')

      expect(Object.keys(result)).toEqual(['bottleneck', 'stop'])
      expect(result.bottleneck).toEqual({
        target_key: 'bottleneck',
        kind: 'comment',
        comment_text: 'À revoir.',
        created_at: '2026-09-26T10:00:00.000Z',
      })
    })

    it('rend un objet VIDE — jamais `null` — quand l’utilisateur n’a laissé aucune note', async () => {
      const { service } = serviceWith([])

      expect(await service.listForUser('u1')).toEqual({})
    })

    it('lit UNIQUEMENT les notes de CET utilisateur — la requête est scopée', async () => {
      const { service, find } = serviceWith([])

      await service.listForUser('u1')

      const call = find.mock.calls[0]?.[0] as { where: { user_id: string } }
      expect(call.where).toEqual(expect.objectContaining({ user_id: 'u1' }))
    })

    it('trie DÉCROISSANT par date — la ligne la plus récente par cible doit être en tête pour le dédoublonnage', async () => {
      const { service, find } = serviceWith([])

      await service.listForUser('u1')

      const call = find.mock.calls[0]?.[0] as { order: unknown }
      expect(call.order).toEqual({ created_at: 'DESC' })
    })
  })
})
