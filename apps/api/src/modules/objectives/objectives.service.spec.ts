import { ForbiddenException } from '@nestjs/common'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { MemberObjectiveEntity } from '../../database/entities/member-objective.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { ObjectivesService } from './objectives.service'

describe('ObjectivesService', () => {
  let repo: MockRepository<MemberObjectiveEntity>
  let workspaceContext: { resolveActiveWorkspace: jest.Mock; assertMember: jest.Mock; extraPermissionsOf: jest.Mock }
  let service: ObjectivesService

  beforeEach(() => {
    repo = createMockRepository<MemberObjectiveEntity>()
    workspaceContext = {
      extraPermissionsOf: jest.fn(async () => []),
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      assertMember: jest.fn().mockResolvedValue({}),
    }
    service = new ObjectivesService(repo as never, workspaceContext as unknown as WorkspaceContextService)
  })

  describe('getMyObjective', () => {
    it('returns a null objective (never a fabricated 0) when none is declared', async () => {
      repo.findOne.mockResolvedValue(null)
      const result = await service.getMyObjective('u1', '2026-07-01')
      expect(result).toEqual({ period_month: '2026-07-01', objective: null })
    })

    it('maps the stored objective to the wire (revenue as a number)', async () => {
      repo.findOne.mockResolvedValue({
        id: 'obj-1',
        user_id: 'u1',
        workspace_id: 'ws-1',
        period_month: '2026-07-01',
        target_meetings: 8,
        target_accounts: null,
        target_revenue: '50000',
        created_at: new Date('2026-07-01T00:00:00.000Z'),
        updated_at: new Date('2026-07-02T00:00:00.000Z'),
      } as MemberObjectiveEntity)

      const result = await service.getMyObjective('u1', '2026-07-01')
      expect(result.objective).toMatchObject({
        id: 'obj-1',
        target_meetings: 8,
        target_accounts: null,
        target_revenue: 50000,
      })
    })
  })

  describe('upsertMyObjective', () => {
    it('merges partially: an omitted target is untouched, a null clears it', async () => {
      repo.findOne.mockResolvedValue({
        id: 'obj-1',
        user_id: 'u1',
        workspace_id: 'ws-1',
        period_month: '2026-07-01',
        target_meetings: 8,
        target_accounts: 5,
        target_revenue: '50000',
        created_at: new Date('2026-07-01T00:00:00.000Z'),
        updated_at: new Date('2026-07-01T00:00:00.000Z'),
      } as MemberObjectiveEntity)
      repo.save.mockImplementation(async (e: MemberObjectiveEntity) => e)

      // target_accounts omitted (untouched), target_revenue null (cleared).
      const result = await service.upsertMyObjective('u1', { target_meetings: 10, target_revenue: null })

      const saved = repo.save.mock.calls[0][0] as MemberObjectiveEntity
      expect(saved.target_meetings).toBe(10)
      expect(saved.target_accounts).toBe(5) // untouched
      expect(saved.target_revenue).toBeNull() // cleared
      expect(result.target_revenue).toBeNull()
    })

    it('creates a fresh objective for the current month when none exists', async () => {
      repo.findOne.mockResolvedValue(null)
      repo.create.mockImplementation((e: Partial<MemberObjectiveEntity>) => e as MemberObjectiveEntity)
      repo.save.mockImplementation(async (e: MemberObjectiveEntity) => ({
        ...e,
        id: 'new',
        created_at: new Date('2026-07-10T00:00:00.000Z'),
        updated_at: new Date('2026-07-10T00:00:00.000Z'),
      }))

      await service.upsertMyObjective('u1', { period_month: '2026-07-01', target_accounts: 12 })

      const created = repo.create.mock.calls[0][0] as Partial<MemberObjectiveEntity>
      expect(created).toMatchObject({ user_id: 'u1', workspace_id: 'ws-1', period_month: '2026-07-01' })
      // Membership is proven before writing.
      expect(workspaceContext.assertMember).toHaveBeenCalledWith('u1', 'ws-1')
    })
  })

  describe('getTeamProgress', () => {
    it('refuses a non-manager', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'member' })
      await expect(service.getTeamProgress('u2')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('returns an empty roster when nobody declared a target', async () => {
      repo.find.mockResolvedValue([])
      const result = await service.getTeamProgress('u1', '2026-07-01')
      expect(result).toEqual({ period_month: '2026-07-01', members: [] })
      // No achieved queries fired when there is nothing to report against.
      expect(repo.manager.query).not.toHaveBeenCalled()
    })

    it('reports only members with a declared target, achieved computed on real data', async () => {
      repo.find.mockResolvedValue([
        {
          user_id: 'u1',
          period_month: '2026-07-01',
          target_meetings: 8,
          target_accounts: null,
          target_revenue: '50000',
        },
        // No target at all → excluded (never a 0/0 bar).
        {
          user_id: 'u2',
          period_month: '2026-07-01',
          target_meetings: null,
          target_accounts: null,
          target_revenue: null,
        },
      ] as MemberObjectiveEntity[])
      repo.manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes("action_type = 'rdv_obtained'")) return [{ userId: 'u1', count: 3 }]
        if (sql.includes('FROM accounts')) return [{ userId: 'u1', count: 2 }]
        if (sql.includes("stage = 'won'")) return [{ userId: 'u1', amount: 20000 }]
        return []
      })

      const result = await service.getTeamProgress('u1', '2026-07-01')

      expect(result.members).toHaveLength(1)
      expect(result.members[0]).toEqual({
        user_id: 'u1',
        period_month: '2026-07-01',
        targets: { meetings: 8, accounts: null, revenue: 50000 },
        achieved: { meetings: 3, accounts: 2, revenue: 20000 },
      })
    })

    it('achieved revenue only sums entered amounts (0 is a real 0, never invented)', async () => {
      repo.find.mockResolvedValue([
        {
          user_id: 'u1',
          period_month: '2026-07-01',
          target_meetings: null,
          target_accounts: null,
          target_revenue: '90000',
        },
      ] as MemberObjectiveEntity[])
      repo.manager.query.mockResolvedValue([]) // no rows anywhere → achieved 0

      const result = await service.getTeamProgress('u1', '2026-07-01')
      expect(result.members[0].achieved.revenue).toBe(0)
    })
  })

  describe('getMyCommercialObjectives — lot FA (#2114.16-.27)', () => {
    it('always returns the seven axes, in order, even with no target declared', async () => {
      repo.findOne.mockResolvedValue(null)
      repo.manager.query.mockResolvedValue([])

      const result = await service.getMyCommercialObjectives('u1', '2026-09-01')

      expect(result.period_month).toBe('2026-09-01')
      expect(result.objectives.map(o => o.axis)).toEqual([
        'meetings',
        'qualified_needs',
        'placements',
        'revenue',
        'margin',
        'new_accounts',
        'consultants_on_mission',
      ])
      // Aucune cible déclarée → chaque `target` est `null`, jamais un 0 fabriqué.
      expect(result.objectives.every(o => o.target === null)).toBe(true)
    })

    it('margin is null (never 0) when no active mission carries both rate and cost', async () => {
      repo.findOne.mockResolvedValue({
        target_meetings: null,
        target_accounts: null,
        target_revenue: null,
        target_qualified_needs: null,
        target_placements: null,
        target_margin_percent: '30',
        target_consultants_on_mission: null,
      } as MemberObjectiveEntity)
      repo.manager.query.mockImplementation(async (sql: string) => {
        // ⚠️ La VRAIE forme rendue par Postgres depuis le retrait du `COALESCE`
        // (GA-66) : `SUM(...) FILTER (...)` sur zéro ligne retenue rend `NULL`,
        // pas `0`. Le double mentait tant qu'il rendait `rate: 0` — il restait
        // vert sur une forme que la base ne produit plus.
        if (sql.includes('daily_rate')) return [{ measured: 0, total: 2, rate: null, cost: null }]
        return []
      })

      const result = await service.getMyCommercialObjectives('u1', '2026-09-01')
      const margin = result.objectives.find(o => o.axis === 'margin')!
      expect(margin.target).toBe(30)
      expect(margin.achieved).toBeNull()
      expect(margin.coverage).toEqual({ measured: 0, total: 2 })
    })

    it('margin stays null when the SUM is NULL even if the counter disagrees (GA-66)', async () => {
      // Le témoin qui sait dire NON : `measured` non nul MAIS la somme absente.
      // C'est la forme qu'un `COALESCE` réintroduit ferait disparaître — elle
      // rendrait alors `0 %`, c'est-à-dire « mission à perte », une donnée
      // inventée. Si quelqu'un remet le `COALESCE`, ce test tombe.
      repo.findOne.mockResolvedValue(null)
      repo.manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('daily_rate')) return [{ measured: 2, total: 2, rate: null, cost: null }]
        return []
      })

      const result = await service.getMyCommercialObjectives('u1', '2026-09-01')
      const margin = result.objectives.find(o => o.axis === 'margin')!
      expect(margin.achieved).toBeNull()
      expect(margin.coverage).toEqual({ measured: 2, total: 2 })
    })

    it('margin computes a real percentage when rate and cost are both known', async () => {
      repo.findOne.mockResolvedValue(null)
      repo.manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('daily_rate')) return [{ measured: 1, total: 1, rate: 1000, cost: 700 }]
        return []
      })

      const result = await service.getMyCommercialObjectives('u1', '2026-09-01')
      const margin = result.objectives.find(o => o.axis === 'margin')!
      expect(margin.achieved).toBe(30)
      expect(margin.coverage).toEqual({ measured: 1, total: 1 })
    })

    it('qualified needs: measured excludes needs without a dated status change, total keeps them', async () => {
      repo.findOne.mockResolvedValue(null)
      repo.manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes("status = 'qualified'")) return [{ measured: 2, total: 3 }]
        return []
      })

      const result = await service.getMyCommercialObjectives('u1', '2026-09-01')
      const needs = result.objectives.find(o => o.axis === 'qualified_needs')!
      expect(needs.achieved).toBe(2)
      expect(needs.coverage).toEqual({ measured: 2, total: 3 })
    })

    it('consultants on mission is a live headcount from mission_assignments', async () => {
      repo.findOne.mockResolvedValue(null)
      repo.manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('mission_assignments')) return [{ count: 4 }]
        return []
      })

      const result = await service.getMyCommercialObjectives('u1', '2026-09-01')
      const consultants = result.objectives.find(o => o.axis === 'consultants_on_mission')!
      expect(consultants.achieved).toBe(4)
      expect(consultants.coverage).toEqual({ measured: 4, total: 4 })
    })
  })
})
