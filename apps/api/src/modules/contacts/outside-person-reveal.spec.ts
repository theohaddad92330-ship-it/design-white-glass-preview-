import { isFailure, isSuccess } from '@bellum/utils'
import { ContactsService, isIncompleteContactName } from './contacts.service'
import { ContactEntity } from '../../database/entities/contact.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #4421.16 (décision Louis 25/10) — la personne qu'on révèle au clic devient un contact du compte, SANS doublon :
 * retrouvée avant d'être insérée (même porte que la collecte, `bulkInsert` : identité par référence de la source
 * et par nom normalisé, #4479), jamais créée si elle a été effacée (RGPD).
 */
describe('#4421.16 — ContactsService.ensureOutsidePerson', () => {
  let repo: MockRepository<ContactEntity>
  let service: ContactsService
  const person = { fullName: 'Inès D.', title: 'Responsable recrutement', apolloId: 'p-ines' }

  beforeEach(() => {
    repo = createMockRepository<ContactEntity>()
    const workspace = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }),
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
    }
    service = new ContactsService(
      repo as never,
      createMockRepository() as never,
      {} as never,
      {} as never,
      workspace as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      createMockRepository() as never,
      createMockRepository() as never,
      {} as never,
      {} as never,
      createMockRepository() as never,
      {} as never,
    )
  })

  it('crée la personne par la porte de la collecte, avec sa référence, et rend la ligne', async () => {
    const created = { id: 'ct-new', account_id: 'acc-1', full_name: 'Inès D.', raw_data: { apolloId: 'p-ines' } }
    const bulk = jest.spyOn(service, 'bulkInsert').mockResolvedValue([created as unknown as ContactEntity])
    repo.find.mockResolvedValue([created])

    const result = await service.ensureOutsidePerson('acc-1', 'user-1', person)

    expect(bulk).toHaveBeenCalledWith('acc-1', 'user-1', [
      expect.objectContaining({
        fullName: 'Inès D.',
        title: 'Responsable recrutement',
        apolloId: 'p-ines',
        source: 'apollo',
      }),
    ])
    expect(isSuccess(result) && result.output.id).toBe('ct-new')
  })

  it('retrouve la personne déjà là (même référence) au lieu d’en créer une seconde', async () => {
    const existing = { id: 'ct-old', account_id: 'acc-1', full_name: 'Inès Durand', raw_data: { apolloId: 'p-ines' } }
    jest.spyOn(service, 'bulkInsert').mockResolvedValue([])
    repo.find.mockResolvedValue([{ id: 'ct-other', full_name: 'Paul Martin', raw_data: {} }, existing])

    const result = await service.ensureOutsidePerson('acc-1', 'user-1', person)

    expect(isSuccess(result) && result.output.id).toBe('ct-old')
  })

  it('dit NON pour une personne effacée : la collecte l’a écartée, rien n’est rendu, rien ne sera enrichi', async () => {
    jest.spyOn(service, 'bulkInsert').mockResolvedValue([])
    repo.find.mockResolvedValue([{ id: 'ct-other', full_name: 'Paul Martin', raw_data: {} }])

    const result = await service.ensureOutsidePerson('acc-1', 'user-1', person)

    expect(isFailure(result) && result.problem.code).toBe('suppressed')
  })
})

describe('#4421.16 — un nom masqué par la source est incomplet (l’enrichissement le complète)', () => {
  it.each(['Inès', 'Inès D.', 'Inès D', 'Séverine Mo***y', ''])('« %s » est incomplet', name => {
    expect(isIncompleteContactName(name)).toBe(true)
  })
  it.each(['Inès Durand', 'Jean-Marc Le Goff', 'Anne de La Tour'])('« %s » est complet', name => {
    expect(isIncompleteContactName(name)).toBe(false)
  })
})
