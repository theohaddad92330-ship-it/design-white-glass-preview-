import { ContactsService } from './contacts.service'
import { resolveBrand } from '@bellum/contracts'

const brandsStub = {
  getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

/**
 * #3871.1 (lot V11, 07/10, recette prod 2e passe) — l'utilisateur DÉCLARE
 * qu'un contact a quitté l'entreprise, depuis la conversation Laura
 * (`propose_contact_departure`, geste utilisateur auto-approuvé).
 *
 * Recette KO : Laura répondait « je ne peux pas modifier directement le
 * statut de la fiche » — aucun appelant n'existait pour cette porte. Ce test
 * verrouille : l'état visé est TOUJOURS `historique` (jamais recalculé contre
 * le signal `employerMismatch`), on ARCHIVE (jamais une suppression), les
 * séquences actives s'arrêtent, et `rejete` — terminal plus FORT — n'est
 * jamais écrasé par une déclaration de départ.
 */
describe('déclaration de départ d’un contact (#3871.1)', () => {
  const contact = { id: 'c-1', user_id: 'u-1', lifecycle_state: 'actionnable' }
  let repo: {
    findOne: jest.Mock
    update: jest.Mock
    query: jest.Mock
  }
  let lifecycleTransitions: { insert: jest.Mock }
  let service: ContactsService

  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue({ ...contact }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      query: jest.fn().mockResolvedValue([]),
    }
    lifecycleTransitions = { insert: jest.fn().mockResolvedValue(undefined) }
    // Même posture que `contact-exclusion.spec.ts` : seules les dépendances
    // sur le chemin testé sont mockées, les treize autres ne sont pas touchées.
    service = new ContactsService(
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      lifecycleTransitions as never,
      {} as never,
      {} as never,
      {} as never,
      brandsStub as never,
    )
  })

  it('passe le contact en historique et le journalise comme un geste HUMAIN', async () => {
    const result = await service.declareContactDeparted('c-1', 'u-1')
    expect(result.type).toBe('success')
    if (result.type !== 'success') return
    expect(result.output).toEqual({ contact_id: 'c-1', lifecycle_state: 'historique' })
    expect(repo.update).toHaveBeenCalledWith('c-1', { lifecycle_state: 'historique' })
    expect(lifecycleTransitions.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_id: 'c-1',
        from_state: 'actionnable',
        to_state: 'historique',
        source: 'manual',
        actor: 'u-1',
      }),
    )
  })

  it('arrête les séquences actives de ce contact (même geste que la transition CALCULÉE)', async () => {
    await service.declareContactDeparted('c-1', 'u-1')
    expect(repo.query).toHaveBeenCalled()
  })

  it('refuse un contact qui n’appartient pas à l’appelant, SANS écrire', async () => {
    repo.findOne.mockResolvedValue(null)
    const result = await service.declareContactDeparted('c-1', 'u-1')
    expect(result.type).toBe('failure')
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('un contact déjà en historique n’est pas réécrit (rien à rejouer)', async () => {
    repo.findOne.mockResolvedValue({ ...contact, lifecycle_state: 'historique' })
    const result = await service.declareContactDeparted('c-1', 'u-1')
    expect(result.type).toBe('success')
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('`rejete` est un terminal plus FORT : une déclaration de départ ne l’écrase jamais', async () => {
    repo.findOne.mockResolvedValue({ ...contact, lifecycle_state: 'rejete' })
    const result = await service.declareContactDeparted('c-1', 'u-1')
    expect(result.type).toBe('success')
    if (result.type !== 'success') return
    expect(result.output.lifecycle_state).toBe('rejete')
    expect(repo.update).not.toHaveBeenCalled()
  })
})
