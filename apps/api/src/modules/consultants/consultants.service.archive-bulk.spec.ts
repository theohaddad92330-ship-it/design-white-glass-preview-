import type { Repository } from 'typeorm'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ConsultantsService } from './consultants.service'

/**
 * #2662.2 — `archiveBulk` (« nettoyer mon vivier », Louis 20/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le geste EN LOT ne recode PAS le cloisonnement : il passe par
 * `applyConsultantScope`, exactement comme `findScoped` (utilisé par l'archivage
 * unitaire) et comme `CvStudioService` (finding pentest #2,
 * `cv-studio.scope.spec.ts`). Cette garde-ci vérifie deux choses distinctes :
 *
 *  1. la requête envoyée au serveur porte BIEN le filtre `c.id IN (:...ids)`
 *     ET le prédicat de cloisonnement — la même chaîne que
 *     `cv-studio.scope.spec.ts` vérifie déjà pour `applyConsultantScope` ;
 *  2. UN PROFIL D'UN AUTRE ESPACE N'EST JAMAIS TOUCHÉ : simulée comme la
 *     requête SQL réelle la rendrait (elle ne revient PAS dans `getMany()`),
 *     la fiche hors périmètre atterrit dans `refused`, jamais dans `archived`,
 *     et `repo.save` n'est JAMAIS appelé avec elle.
 */
/** #4196 — personne n'est en mission dans ces scénarios : la lecture des affectations rend vide. */
const NO_ONE_ON_MISSION = { query: jest.fn(async () => []) }

function fakeEntity(id: string, over: Partial<ConsultantEntity> = {}): ConsultantEntity {
  return { id, archived_at: null, archived_reason: null, ...over } as ConsultantEntity
}

describe('ConsultantsService.archiveBulk — le lot ne touche jamais un profil hors périmètre', () => {
  it('interroge par IN (:...ids) ET par le prédicat de cloisonnement (même patron que CvStudioService)', async () => {
    const andWhereCalls: Array<{ sql: string; params: Record<string, unknown> }> = []
    const whereCalls: Array<{ sql: string; params: Record<string, unknown> }> = []
    const qb = {
      where: jest.fn(function (this: unknown, sql: string, params: Record<string, unknown>) {
        whereCalls.push({ sql, params })
        return this
      }),
      andWhere: jest.fn(function (this: unknown, sql: string, params: Record<string, unknown>) {
        andWhereCalls.push({ sql, params })
        return this
      }),
      getMany: jest.fn().mockResolvedValue([]),
    }
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb), save: jest.fn(), manager: NO_ONE_ON_MISSION }
    const service = new ConsultantsService(
      repo as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    )

    await service.archiveBulk(['c1', 'c2'], 'ws-A', 'user-1', null)

    expect(whereCalls).toHaveLength(1)
    expect(whereCalls[0]?.sql).toBe('c.id IN (:...ids)')
    expect(whereCalls[0]?.params).toEqual({ ids: ['c1', 'c2'] })
    // Le MÊME prédicat que `cv-studio.scope.spec.ts` vérifie pour
    // `applyConsultantScope` — cloisonné, pas un second filtre inventé ici.
    expect(andWhereCalls).toHaveLength(1)
    expect(andWhereCalls[0]?.sql).toContain('workspace_id = :workspaceId OR')
    expect(andWhereCalls[0]?.params).toEqual({ workspaceId: 'ws-A', userId: 'user-1' })
  })

  it('un id demandé mais hors périmètre (absent de getMany) revient en `refused` (not_found), jamais archivé ni sauvegardé', async () => {
    // Ce que la requête cloisonnée rendrait RÉELLEMENT en base : seule la
    // fiche de l'espace `ws-A` revient, celle de `ws-B` n'apparaît jamais —
    // `applyConsultantScope` l'a déjà exclue en SQL.
    const ownEntity = fakeEntity('own-profile')
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([ownEntity]),
    }
    const saved: ConsultantEntity[] = []
    const repo = {
      manager: NO_ONE_ON_MISSION,
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      save: jest.fn(async (entities: ConsultantEntity[]) => {
        saved.push(...entities)
        return entities
      }),
    }
    const service = new ConsultantsService(
      repo as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    )

    const result = await service.archiveBulk(['own-profile', 'other-workspace-profile'], 'ws-A', 'user-1', 'nettoyage')

    expect(result.archived).toEqual(['own-profile'])
    expect(result.refused).toEqual([{ id: 'other-workspace-profile', reason: 'not_found', ends_on: null }])
    // `repo.save` n'a JAMAIS vu la fiche hors périmètre — elle n'a même pas
    // été chargée, `getMany` ne l'a pas rendue.
    expect(saved).toEqual([ownEntity])
    expect(ownEntity.archived_at).toBeInstanceOf(Date)
    expect(ownEntity.archived_reason).toBe('nettoyage')
  })

  it('dédoublonne les ids répétés, et ne fait qu’une requête pour toute la sélection', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([fakeEntity('c1')]),
    }
    const repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      save: jest.fn(async (e: unknown) => e),
      manager: NO_ONE_ON_MISSION,
    }
    const service = new ConsultantsService(
      repo as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    )

    await service.archiveBulk(['c1', 'c1', 'c1'], 'ws-A', 'user-1', null)

    expect(repo.createQueryBuilder).toHaveBeenCalledTimes(1)
    expect(qb.where).toHaveBeenCalledWith('c.id IN (:...ids)', { ids: ['c1'] })
  })

  it('une sélection vide ne fait AUCUNE requête', async () => {
    const repo = { createQueryBuilder: jest.fn(), save: jest.fn() }
    const service = new ConsultantsService(
      repo as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    )

    const result = await service.archiveBulk([], 'ws-A', 'user-1', null)

    expect(result).toEqual({ archived: [], refused: [] })
    expect(repo.createQueryBuilder).not.toHaveBeenCalled()
  })

  it("n'écrase jamais un `archived_at` déjà posé (réversible, jamais une double archive)", async () => {
    const already = fakeEntity('c1', { archived_at: new Date('2026-01-01T00:00:00Z'), archived_reason: 'ancien motif' })
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([already]),
    }
    const repo = {
      manager: NO_ONE_ON_MISSION,
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      save: jest.fn(async (e: ConsultantEntity[]) => e),
    }
    const service = new ConsultantsService(
      repo as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    )

    await service.archiveBulk(['c1'], 'ws-A', 'user-1', 'motif neuf')

    expect(already.archived_at).toEqual(new Date('2026-01-01T00:00:00Z'))
    // La raison, elle, se met à jour — même patron que `archive()` unitaire.
    expect(already.archived_reason).toBe('motif neuf')
  })
})
