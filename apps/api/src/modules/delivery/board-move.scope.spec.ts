import type { AccountEntity } from '../../database/entities/account.entity'
import type { MissionCommercialTermsEntity } from '../../database/entities/mission-commercial-terms.entity'
import type { MissionEntity } from '../../database/entities/mission.entity'
import type { MissionTimesheetEntity } from '../../database/entities/mission-timesheet.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import { createMockRepository } from '../../database/test-utils'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { DeliveryService } from './delivery.service'

const WS_A = 'ws-a'
const WS_B = 'ws-b'
const USER = 'user-a'
const MISSION_A = '44444444-4444-4444-8444-44444444000a'
const MISSION_B = '44444444-4444-4444-8444-44444444000b'

/**
 * #2671 — LA TROISIÈME FOIS LE MÊME MOTIF : `moveBoardCard` lisait la mission
 * par `findOne({ where: { id: missionId } })` puis vérifiait après coup
 * `workspaceId && mission.workspace_id !== workspaceId`.
 *
 * Ce prédicat s'effondre quand `workspaceId` vaut `null` (premier terme falsy),
 * et le geste ÉCRIT : `missions.update({ id }, { status, stage_entered_at })`.
 * Déplacer la carte d'une autre ESN d'une colonne à l'autre est la forme la
 * plus visible du défaut — c'est celle qu'on découvre en réunion.
 *
 * L'unique appelant (`delivery.controller.ts`, `POST missions/:id/move`,
 * `JwtGuard` + `records:write`) passe un `workspaceId` résolu, donc aucune
 * exploitation n'est démontrée — exactement comme pour les deux jumeaux
 * précédents. Ce qui change ici : la garantie cesse de dépendre de la
 * discipline de l'appelant. La borne descend dans la requête, et sans espace on
 * ne déplace RIEN.
 */
describe('DeliveryService.moveBoardCard — cloisonnement d’espace (#2671)', () => {
  function build(missionsEnBase: Partial<MissionEntity>[]) {
    const missions = createMockRepository<MissionEntity>()
    const timesheets = createMockRepository<MissionTimesheetEntity>()
    const accounts = createMockRepository<AccountEntity>()
    const terms = createMockRepository<MissionCommercialTermsEntity>()
    const projects = createMockRepository<ProjectEntity>()

    const wheres: Record<string, unknown>[] = []
    // Un dépôt qui HONORE son `where`, comme la vraie base : c'est la seule
    // façon de prouver que le refus vient de la REQUÊTE.
    missions.findOne.mockImplementation(async (options: { where: Record<string, unknown> }) => {
      wheres.push(options.where)
      const trouve = missionsEnBase.find(mission =>
        Object.entries(options.where).every(
          ([cle, valeur]) => (mission as unknown as Record<string, unknown>)[cle] === valeur,
        ),
      )
      return (trouve as MissionEntity) ?? null
    })
    missions.update.mockResolvedValue({ affected: 1 } as never)
    missions.manager = { query: jest.fn(async () => []) } as never

    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS_A, role: 'owner' }),
    } as unknown as WorkspaceContextService

    const service = new DeliveryService(
      missions as never,
      timesheets as never,
      accounts as never,
      projects as never,
      // #2191.17 / #2191.18 — le besoin, non lu par ces tests de portée.
      { findOne: jest.fn() } as never,
      terms as never,
      { findOne: jest.fn() } as never,
      { findOne: jest.fn() } as never,
      // #2339.7 — le vivier des positionnements, non lu par ces tests de portée.
      { findOne: jest.fn() } as never,
      { assign: jest.fn() } as never,
      workspaceContext,
      { record: jest.fn() } as never,
      // #2411.11 — les résolutions de risque, non lues par ces tests de portée.
      { find: jest.fn().mockResolvedValue([]), upsert: jest.fn() } as never,
      // #2411.6 — l'état de facturation, non lu par ces tests de portée.
      {
        list: jest.fn().mockResolvedValue({ items: [], summary: {}, month: '2026-01', canReadFinance: true }),
      } as never,
    )
    return { service, missions, wheres }
  }

  const mission = (id: string, workspaceId: string): Partial<MissionEntity> => ({
    id,
    workspace_id: workspaceId,
    status: 'active',
  })

  it('sans espace résolu, ne déplace RIEN — l’absence d’espace n’est pas un passe-partout', async () => {
    const { service, missions } = build([mission(MISSION_B, WS_B)])

    const issue = await service.moveBoardCard(null, USER, `mission:${MISSION_B}`, {
      to: 'en_cours',
      acceptedActions: [],
    } as never)

    expect(issue).toBe('not_found')
    // Aucune écriture sur la mission d'une autre ESN.
    expect(missions.update).not.toHaveBeenCalled()
  })

  it('la borne est DANS la lecture — la carte d’un autre espace ne remonte pas', async () => {
    const { service, missions, wheres } = build([mission(MISSION_B, WS_B)])

    const issue = await service.moveBoardCard(WS_A, USER, `mission:${MISSION_B}`, {
      to: 'en_cours',
      acceptedActions: [],
    } as never)

    expect(issue).toBe('not_found')
    expect(missions.update).not.toHaveBeenCalled()
    expect(wheres).toEqual([{ id: MISSION_B, workspace_id: WS_A }])
  })

  it('sait dire OUI — la carte de l’espace se déplace toujours', async () => {
    const { service, missions } = build([mission(MISSION_A, WS_A)])

    const issue = await service.moveBoardCard(WS_A, USER, `mission:${MISSION_A}`, {
      to: 'en_cours',
      acceptedActions: [],
    } as never)

    expect(issue).not.toBe('not_found')
    expect(missions.update).toHaveBeenCalledTimes(1)
  })

  it('#2338 — onboarding → « En cours » sans les deux accords est REFUSÉ (409), la carte ne bouge pas', async () => {
    const { service, missions } = build([{ id: MISSION_A, workspace_id: WS_A, status: 'onboarding' }])
    missions.manager = {
      query: jest.fn(async (sql: string) =>
        sql.includes('AS consultant_assigned')
          ? [{ started_on: '2026-10-01', daily_rate: 650, consultant_assigned: true }]
          : [],
      ),
    } as never

    await expect(
      service.moveBoardCard(WS_A, USER, `mission:${MISSION_A}`, { to: 'en_cours', acceptedActions: [] } as never),
    ).rejects.toMatchObject({ status: 409 })
    expect(missions.update).not.toHaveBeenCalled()
  })
})
