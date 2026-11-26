import { NotFoundException } from '@nestjs/common'
import { ContactDuplicateDecisionsService, orderedPair } from './contact-duplicate-decisions.service'

/** #4114.4 — « ce sont les mêmes » / « pas les mêmes » : on enregistre une décision, on ne fusionne JAMAIS. */
describe('#4114.4 — ContactDuplicateDecisionsService', () => {
  const pair = { left: { id: 'b' }, right: { id: 'a' }, score: 6, reasons: ['même nom'] }

  function build(rows: Array<Record<string, unknown>> = []) {
    // Seules `find` et `upsert` existent : tout `delete`/`update` sur une fiche lèverait un TypeError.
    const repo = { find: jest.fn().mockResolvedValue(rows), upsert: jest.fn().mockResolvedValue(undefined) }
    return { repo, service: new ContactDuplicateDecisionsService(repo as never) }
  }

  it('normalise l’ordre : une paire = une ligne', () => {
    expect(orderedPair('b', 'a')).toEqual(['a', 'b'])
    expect(orderedPair('a', 'b')).toEqual(['a', 'b'])
  })

  it('« ce sont les mêmes » : enregistre la confirmation bornée à l’espace, sans toucher une fiche', async () => {
    const { repo, service } = build()
    await service.record('ws', 'u', 'acc', [pair], 'b', 'a', 'same')
    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws',
        account_id: 'acc',
        left_contact_id: 'a',
        right_contact_id: 'b',
        decision: 'same',
        user_id: 'u',
      }),
      ['workspace_id', 'left_contact_id', 'right_contact_id'],
    )
    expect(Object.keys(repo).sort()).toEqual(['find', 'upsert'])
  })

  it('« pas les mêmes » : la paire ne revient plus dans les propositions', async () => {
    const { service } = build([{ left_contact_id: 'a', right_contact_id: 'b', decision: 'not_same' }])
    expect(await service.overlay('ws', 'acc', [pair])).toEqual([])
  })

  it('une paire confirmée reste proposée et porte sa confirmation', async () => {
    const { service } = build([{ left_contact_id: 'a', right_contact_id: 'b', decision: 'same' }])
    expect(await service.overlay('ws', 'acc', [pair])).toEqual([{ ...pair, decision: 'same' }])
  })

  it('une paire sans décision reste proposée, decision null', async () => {
    const { service } = build()
    expect(await service.overlay('ws', 'acc', [pair])).toEqual([{ ...pair, decision: null }])
  })

  it('DROITS : un utilisateur d’un AUTRE espace ne voit aucune paire, donc ne peut en décider aucune (404, rien écrit)', async () => {
    const { repo, service } = build()
    await expect(service.record('autre-ws', 'intrus', 'acc', [], 'a', 'b', 'not_same')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(repo.upsert).not.toHaveBeenCalled()
  })

  it('DROITS : une paire qui n’est pas dans les propositions visibles est refusée (pas d’identifiants arbitraires)', async () => {
    const { repo, service } = build()
    await expect(service.record('ws', 'u', 'acc', [pair], 'a', 'zzz', 'same')).rejects.toBeInstanceOf(NotFoundException)
    expect(repo.upsert).not.toHaveBeenCalled()
  })
})
