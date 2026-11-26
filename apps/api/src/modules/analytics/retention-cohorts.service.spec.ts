import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { RetentionCohortsService } from './retention-cohorts.service'

const MAINTENANT = new Date('2026-09-15T10:00:00Z')

/**
 * Ce qui se vérifie ici est le CÂBLAGE : quelles tables sont lues, avec quels
 * filtres, et que la dérivation pure reçoit bien ce que le SQL a rendu. Le
 * calcul lui-même est testé sans base dans `retention-cohorts.spec.ts`.
 */
function makeService(): {
  service: RetentionCohortsService
  workspaces: MockRepository<WorkspaceEntity>
  actions: MockRepository<UserActionEntity>
} {
  const workspaces = createMockRepository<WorkspaceEntity>()
  const actions = createMockRepository<UserActionEntity>()
  const service = new RetentionCohortsService(
    workspaces as unknown as ConstructorParameters<typeof RetentionCohortsService>[0],
    actions as unknown as ConstructorParameters<typeof RetentionCohortsService>[1],
  )
  return { service, workspaces, actions }
}

describe('RetentionCohortsService (#1658.1)', () => {
  it('assemble le dénominateur (workspaces) et le numérateur (user_actions)', async () => {
    const { service, workspaces, actions } = makeService()
    workspaces._qb.getRawMany.mockResolvedValue([
      { workspaceId: 'a', createdAt: '2026-07-05T08:00:00.000Z' },
      { workspaceId: 'b', createdAt: '2026-07-06T08:00:00.000Z' },
    ])
    actions._qb.getRawMany.mockResolvedValue([
      { workspaceId: 'a', mois: '2026-07' },
      { workspaceId: 'b', mois: '2026-07' },
      { workspaceId: 'a', mois: '2026-09' },
    ])

    const rapport = await service.cohortes(MAINTENANT)

    expect(rapport.cohortes).toHaveLength(1)
    expect(rapport.cohortes[0]).toMatchObject({ cohorte: '2026-07', espaces: 2, moisEcoules: 2 })
    expect(rapport.cohortes[0]!.retentionParMois.slice(0, 3)).toEqual([1, 0, 0.5])
    expect(rapport.calculeA).toBe(MAINTENANT.toISOString())
  })

  it('écarte les espaces de DÉMO — sur les deux faits, pas sur un seul', async () => {
    const { service, workspaces } = makeService()
    await service.cohortes(MAINTENANT)

    expect(workspaces._qb.where).toHaveBeenCalledWith('w.is_demo = false')
    expect(workspaces._qb.andWhere).toHaveBeenCalledWith('w.demo_slot_index IS NULL')
  })

  it('n’attribue jamais une action sans espace à une cohorte', async () => {
    const { service, actions } = makeService()
    await service.cohortes(MAINTENANT)

    expect(actions._qb.where).toHaveBeenCalledWith('a.workspace_id IS NOT NULL')
  })

  it('tronque le mois en UTC, et la MÊME expression sert au regroupement', async () => {
    // Le piège que ce test ferme : `date_trunc`/`to_char` sur un `timestamptz`
    // emploie le fuseau de la SESSION. Sans `AT TIME ZONE 'UTC'` explicite, la
    // grille changerait selon la machine qui la calcule.
    const { service, actions } = makeService()
    await service.cohortes(MAINTENANT)

    const selection = actions._qb.addSelect.mock.calls[0]?.[0] as string
    const regroupement = actions._qb.groupBy.mock.calls[0]?.[0] as string
    expect(selection).toContain("AT TIME ZONE 'UTC'")
    expect(regroupement).toContain(selection)
  })

  it('ne rend aucune cohorte quand la base est vide — sans inventer de ligne', async () => {
    const { service } = makeService()
    const rapport = await service.cohortes(MAINTENANT)

    expect(rapport.cohortes).toEqual([])
    expect(rapport.espaces).toBe(0)
  })
})
