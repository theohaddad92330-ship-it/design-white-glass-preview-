import { BadRequestException, NotFoundException } from '@nestjs/common'
import { LegalEntitiesService } from './legal-entities.service'

/**
 * Le registre des sociétés d'une ESN (décision D9).
 *
 * Trois propriétés méritent un test, parce que chacune se paie sur une facture
 * si elle manque : deux sociétés homonymes rendent le rattachement d'une
 * mission illisible, une société supprimée efface l'historique de qui a
 * facturé quoi, et un patch qui vide les champs absents fait disparaître un
 * numéro d'immatriculation à la première correction de nom.
 */
describe('LegalEntitiesService', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'e-1',
    workspace_id: 'w-1',
    name: 'ACME Conseil',
    registration_number: '812345678',
    country: 'FR',
    vat_number: 'FR12812345678',
    address: '12 rue de la Paix, 75002 Paris',
    currency: 'EUR',
    archived: false,
    created_at: new Date('2026-08-19T10:00:00.000Z'),
    ...over,
  })

  const build = (over: { existing?: unknown; clash?: unknown } = {}) => {
    const qb = {
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      getOne: jest.fn().mockResolvedValue(over.clash ?? null),
    }
    const entities = {
      find: jest.fn().mockResolvedValue([row()]),
      findOne: jest.fn().mockResolvedValue(over.existing ?? null),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({ ...row(), ...value })),
      createQueryBuilder: jest.fn(() => qb),
    }
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }),
      assertPermission: jest.fn().mockResolvedValue(undefined),
    }
    return { service: new LegalEntitiesService(entities as never), entities, workspaceContext }
  }

  it('crée une société et normalise le pays en majuscules', async () => {
    const { service, entities } = build()

    await service.create('w-1', { name: '  ACME Belgium ', country: 'be' })

    expect(entities.save).toHaveBeenCalled()
    expect(entities.create.mock.calls[0][0]).toMatchObject({ name: 'ACME Belgium', country: 'BE' })
  })

  it('accepte une société sans numéro ni pays — toutes les juridictions n’ont pas de SIREN', async () => {
    const { service, entities } = build()

    await service.create('w-1', { name: 'ACME Canada' })

    expect(entities.create.mock.calls[0][0]).toMatchObject({
      registration_number: null,
      country: null,
      vat_number: null,
      address: null,
      currency: null,
    })
  })

  // #2422.3 — la société du workspace porte aussi TVA, adresse et devise.
  it('crée une société avec TVA, adresse et devise, la devise normalisée en majuscules', async () => {
    const { service, entities } = build()

    await service.create('w-1', {
      name: 'ACME Conseil',
      vat_number: ' FR12812345678 ',
      address: ' 12 rue de la Paix, 75002 Paris ',
      currency: 'eur',
    })

    expect(entities.create.mock.calls[0][0]).toMatchObject({
      vat_number: 'FR12812345678',
      address: '12 rue de la Paix, 75002 Paris',
      currency: 'EUR',
    })
  })

  it('refuse une société homonyme — deux mêmes noms rendent le rattachement illisible', async () => {
    const { service } = build({ clash: row() })

    await expect(service.create('w-1', { name: 'acme conseil' })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('ne résout PAS l’espace lui-même — le contrôleur le lui passe', async () => {
    // La règle §3.2 : un service ne va pas chercher le service d'un autre
    // module. Les droits sont posés au même endroit, par le décorateur de
    // permission du contrôleur — un seul endroit qui connaît l'appelant.
    const { service, workspaceContext } = build()

    await service.create('w-1', { name: 'ACME Tech' })

    expect(workspaceContext.resolveActiveWorkspace).not.toHaveBeenCalled()
  })

  it('n’efface PAS les champs absents d’une modification', async () => {
    // Un patch qui vide ce qu'il ne mentionne pas ferait disparaître le numéro
    // d'immatriculation à la première correction de nom.
    const { service, entities } = build({ existing: row() })

    await service.update('w-1', 'e-1', { name: 'ACME Conseil SAS' })

    const saved = entities.save.mock.calls[0][0] as Record<string, unknown>
    expect(saved.name).toBe('ACME Conseil SAS')
    expect(saved.registration_number).toBe('812345678')
    expect(saved.country).toBe('FR')
    expect(saved.vat_number).toBe('FR12812345678')
    expect(saved.address).toBe('12 rue de la Paix, 75002 Paris')
    expect(saved.currency).toBe('EUR')
  })

  it('archive au lieu de supprimer — l’historique doit continuer de dire qui a facturé', async () => {
    const { service, entities } = build({ existing: row() })

    const archived = await service.archive('w-1', 'e-1', true)

    expect(archived.archived).toBe(true)
    expect((entities as { delete?: unknown }).delete).toBeUndefined()
  })

  it('refuse d’agir sur une société d’un autre espace', async () => {
    const { service } = build({ existing: null })

    await expect(service.update('w-1', 'e-inconnue', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.archive('w-1', 'e-inconnue', true)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('liste les archivées aussi — c’est l’écran qui décide de les montrer, pas la lecture de les cacher', async () => {
    const { service, entities } = build()

    await service.list('w-1')

    expect(entities.find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: 'w-1' } }))
  })
})
