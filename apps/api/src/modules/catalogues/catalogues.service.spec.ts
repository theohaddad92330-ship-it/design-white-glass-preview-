import { BadRequestException, NotFoundException } from '@nestjs/common'
import { CataloguesService } from './catalogues.service'

/**
 * Les catalogues d'un espace (BEL-CRM-105).
 *
 * La règle qui coûte : une valeur qui SERT ne se supprime pas. L'effacer
 * emporterait l'explication de tous les enregistrements qui la portaient — et
 * c'est justement ce qu'on relit six mois plus tard.
 */
describe('CataloguesService', () => {
  const build = (over: { row?: unknown; usage?: number; clash?: unknown } = {}) => {
    const qb = {
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      getOne: jest.fn().mockResolvedValue(over.clash ?? null),
    }
    const manager = { query: jest.fn().mockResolvedValue([{ count: String(over.usage ?? 0) }]) }
    const repo = () => ({
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(over.row ?? null),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({ id: 'v-1', ...value })),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(() => qb),
      manager,
    })
    const loss = repo()
    const park = repo()
    const unstaffable = repo()
    return {
      service: new CataloguesService(loss as never, park as never, unstaffable as never),
      loss,
      park,
      manager,
    }
  }

  it('SUPPRIME une valeur que personne n’utilise', async () => {
    const { service, loss } = build({ row: { id: 'v-1', workspace_id: 'w-1', label: 'Prix' }, usage: 0 })
    const result = await service.remove('w-1', 'loss_reasons', 'v-1')
    expect(result.outcome).toBe('delete')
    expect(loss.delete).toHaveBeenCalled()
    expect(loss.update).not.toHaveBeenCalled()
  })

  it('DÉSACTIVE une valeur utilisée — l’effacer emporterait l’explication des enregistrements', async () => {
    const { service, loss } = build({ row: { id: 'v-1', workspace_id: 'w-1', label: 'Prix' }, usage: 12 })
    const result = await service.remove('w-1', 'loss_reasons', 'v-1')
    expect(result.outcome).toBe('archive')
    expect(loss.update).toHaveBeenCalledWith({ id: 'v-1' }, { archived: true })
    expect(loss.delete).not.toHaveBeenCalled()
  })

  it('refuse deux valeurs du même nom — le compteur d’usage serait faux des deux côtés', async () => {
    const { service } = build({ clash: { id: 'v-9', label: 'prix' } })
    await expect(service.add('w-1', 'loss_reasons', 'Prix')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuse d’éditer un catalogue fermé', async () => {
    const { service } = build()
    await expect(service.add('w-1', 'normalised_skills', 'Kubernetes')).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.remove('w-1', 'submission_outcome_reasons', 'price')).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('rend 404 sur une valeur d’un autre espace', async () => {
    const { service } = build({ row: null })
    await expect(service.remove('w-1', 'loss_reasons', 'v-9')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('rend les huit catalogues même quand une source est illisible — un bloc qui jette ne doit pas vider l’écran', async () => {
    const { service, manager } = build()
    // Trouvé EN PRODUCTION : une seule colonne mal nommée (`profiles.offers`,
    // qui n'existe pas — les offres vivent sur `esn_profiles`) faisait tomber
    // la réponse ENTIÈRE en 500, et l'écran s'ouvrait vide sous son titre.
    manager.query.mockRejectedValue(new Error('column "offers" does not exist'))
    const { items } = await service.list('w-1', 'fr')
    expect(items).toHaveLength(8)
    expect(items.every(item => Array.isArray(item.values))).toBe(true)
  })

  it('rend les huit catalogues, jamais un de moins', async () => {
    const { service } = build()
    const { items } = await service.list('w-1', 'fr')
    expect(items).toHaveLength(8)
    // Un catalogue absent de la réponse se lit « il n'existe pas » ; un
    // catalogue vide se lit « il n'a pas encore servi ». Ce n'est pas pareil.
    expect(new Set(items.map(item => item.key)).size).toBe(8)
  })
})
