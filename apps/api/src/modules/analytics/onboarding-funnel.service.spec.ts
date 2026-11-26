import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { OnboardingFunnelService } from './onboarding-funnel.service'

const MAINTENANT = new Date('2026-09-15T10:00:00Z')

/**
 * Ce qui se vérifie ici est le CÂBLAGE : quelles tables sont lues, avec quels
 * filtres, et que la dérivation pure (`onboarding-funnel.spec.ts`) reçoit bien
 * ce que le SQL a rendu. Même partage que `retention-cohorts.service.spec.ts`.
 *
 * #1686.5 ajoute trois requêtes : `events.manager.query` porte désormais TROIS
 * appels (direct / membre / deuxième session), et `actions._qb.getRawMany`
 * porte DEUX appels (première action / mois actifs) — `createQueryBuilder`
 * rend toujours le MÊME mock (voir `test-utils.ts`), donc les deux réponses se
 * chaînent par `mockResolvedValueOnce`, dans l'ordre où `Promise.all` les
 * déclenche.
 */
function makeService(): {
  service: OnboardingFunnelService
  workspaces: MockRepository<WorkspaceEntity>
  events: MockRepository<ProductEventEntity>
  actions: MockRepository<UserActionEntity>
} {
  const workspaces = createMockRepository<WorkspaceEntity>()
  const events = createMockRepository<ProductEventEntity>()
  const actions = createMockRepository<UserActionEntity>()
  const service = new OnboardingFunnelService(
    workspaces as unknown as ConstructorParameters<typeof OnboardingFunnelService>[0],
    events as unknown as ConstructorParameters<typeof OnboardingFunnelService>[1],
    actions as unknown as ConstructorParameters<typeof OnboardingFunnelService>[2],
  )
  return { service, workspaces, events, actions }
}

describe('OnboardingFunnelService (#1686, #1686.5)', () => {
  it('assemble le dénominateur (workspaces) et les six sources de franchissement', async () => {
    const { service, workspaces, events, actions } = makeService()
    workspaces._qb.getRawMany.mockResolvedValue([
      { workspaceId: 'a', createdAt: '2026-07-05T08:00:00.000Z' },
      { workspaceId: 'b', createdAt: '2026-07-06T08:00:00.000Z' },
    ])
    // Ordre d'appel de `Promise.all` dans le service : direct, membre, deuxième
    // session (les trois passent par `events.manager.query`).
    events.manager.query
      .mockResolvedValueOnce([{ workspaceId: 'a', etape: 'analysis_started', atteintLe: '2026-07-10T00:00:00.000Z' }])
      .mockResolvedValueOnce([{ workspaceId: 'a', etape: 'onboarding_started', atteintLe: '2026-07-05T09:00:00.000Z' }])
      .mockResolvedValueOnce([{ workspaceId: 'a', atteintLe: '2026-07-12T00:00:00.000Z' }])
    // Puis première action validée, puis mois actifs (`actions._qb.getRawMany`).
    actions._qb.getRawMany
      .mockResolvedValueOnce([{ workspaceId: 'a', atteintLe: '2026-07-11T00:00:00.000Z' }])
      .mockResolvedValueOnce([{ workspaceId: 'a', mois: '2026-08' }])

    const rapport = await service.entonnoir(MAINTENANT)

    expect(rapport.cohortes).toHaveLength(1)
    expect(rapport.cohortes[0]).toMatchObject({ cohorte: '2026-07', espaces: 2 })
    const onboardingStarted = rapport.cohortes[0]!.etapes.find(e => e.cle === 'onboarding_started')!
    expect(onboardingStarted).toMatchObject({ atteints: 1, part: 0.5 })
    const analysisStarted = rapport.cohortes[0]!.etapes.find(e => e.cle === 'analysis_started')!
    expect(analysisStarted).toMatchObject({ atteints: 1, part: 0.5 })
    const deuxiemeSession = rapport.cohortes[0]!.etapes.find(e => e.cle === 'deuxieme_session')!
    expect(deuxiemeSession).toMatchObject({ atteints: 1, part: 0.5 })
    const premiereAction = rapport.cohortes[0]!.etapes.find(e => e.cle === 'premiere_action_validee')!
    expect(premiereAction).toMatchObject({ atteints: 1, part: 0.5 })
    // Cohorte 2026-07, mois M1 = 2026-08 : la ligne `moisActifs` ci-dessus le porte.
    const actifJ30 = rapport.cohortes[0]!.etapes.find(e => e.cle === 'actif_j30')!
    expect(actifJ30).toMatchObject({ atteints: 1, part: 0.5 })
    expect(rapport.calculeA).toBe(MAINTENANT.toISOString())
  })

  it('écarte les espaces de DÉMO — sur les deux faits, pas sur un seul (même règle que la rétention)', async () => {
    const { service, workspaces } = makeService()
    await service.entonnoir(MAINTENANT)

    expect(workspaces._qb.where).toHaveBeenCalledWith('w.is_demo = false')
    expect(workspaces._qb.andWhere).toHaveBeenCalledWith('w.demo_slot_index IS NULL')
  })

  it('lit `integration_connected` / `analysis_completed` / `analysis_started` directement sur `workspace_id`, sans jointure', async () => {
    const { service, events } = makeService()
    await service.entonnoir(MAINTENANT)

    const [sqlDirect, paramsDirect] = events.manager.query.mock.calls[0] as [string, unknown[]]
    expect(sqlDirect).toContain('workspace_id IS NOT NULL')
    expect(sqlDirect).not.toContain('JOIN')
    expect(paramsDirect[0]).toEqual(['integration_connected', 'analysis_completed', 'analysis_started'])
  })

  it('lit `onboarding_started` / `onboarding_completed` via l’appartenance COURANTE (`workspace_members`)', async () => {
    const { service, events } = makeService()
    await service.entonnoir(MAINTENANT)

    const [sqlMembre, paramsMembre] = events.manager.query.mock.calls[1] as [string, unknown[]]
    expect(sqlMembre).toContain('JOIN workspace_members')
    expect(paramsMembre[0]).toEqual(['onboarding_started', 'onboarding_completed'])
  })

  it('1686.5 — lit `deuxieme_session` sur `user_last_seen.previous_seen_at`, via `workspace_members`', async () => {
    const { service, events } = makeService()
    await service.entonnoir(MAINTENANT)

    const [sqlSession] = events.manager.query.mock.calls[2] as [string, unknown[]]
    expect(sqlSession).toContain('user_last_seen')
    expect(sqlSession).toContain('previous_seen_at IS NOT NULL')
    expect(sqlSession).toContain('JOIN workspace_members')
  })

  it('1686.5 — `première action validée` lit `user_actions`, pas `product_events`', async () => {
    const { service, actions } = makeService()
    await service.entonnoir(MAINTENANT)

    expect(actions.createQueryBuilder).toHaveBeenCalledWith('a')
    expect(actions._qb.where).toHaveBeenCalledWith('a.workspace_id IS NOT NULL')
    expect(actions._qb.groupBy).toHaveBeenCalledWith('a.workspace_id')
  })

  it('1686.5 — `actif_j30` lit les mois actifs (espace, mois) sur `user_actions`, MÊME requête que la rétention', async () => {
    const { service, actions } = makeService()
    await service.entonnoir(MAINTENANT)

    // Le second appel de groupBy porte la forme « mois actifs » (deux colonnes).
    const groupByCalls = actions._qb.groupBy.mock.calls.map(([sql]: [string]) => sql)
    expect(groupByCalls.some((sql: string) => sql.includes('workspace_id') && sql.includes('YYYY-MM'))).toBe(true)
  })

  it('ne rend aucune cohorte quand la base est vide — sans inventer de ligne', async () => {
    const { service } = makeService()
    const rapport = await service.entonnoir(MAINTENANT)

    expect(rapport.cohortes).toEqual([])
    expect(rapport.espaces).toBe(0)
  })
})
