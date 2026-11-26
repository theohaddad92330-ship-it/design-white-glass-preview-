import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { MemberObjectiveEntity } from '../../database/entities/member-objective.entity'
import type { ObjectiveProposalEntity } from '../../database/entities/objective-proposal.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { ObjectiveProposalsService } from './objective-proposals.service'

// Théo D team-business.N2 — « Un objectif choisi, pas imposé en silence ».
describe('ObjectiveProposalsService', () => {
  let proposals: MockRepository<ObjectiveProposalEntity>
  let objectives: MockRepository<MemberObjectiveEntity>
  let ctx: {
    resolveActiveWorkspace: jest.Mock
    extraPermissionsOf: jest.Mock
    getMembership: jest.Mock
    assertMember: jest.Mock
  }
  let service: ObjectiveProposalsService

  beforeEach(() => {
    proposals = createMockRepository<ObjectiveProposalEntity>()
    objectives = createMockRepository<MemberObjectiveEntity>()
    ctx = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      extraPermissionsOf: jest.fn(async () => []),
      getMembership: jest.fn().mockResolvedValue({ user_id: 'u2' }),
      assertMember: jest.fn().mockResolvedValue({}),
    }
    proposals.save.mockImplementation(async (e: unknown) => ({
      id: 'p1',
      created_at: new Date('2026-10-22T10:00:00Z'),
      responded_at: null,
      ...(e as object),
    }))
    objectives.save.mockImplementation(async (e: unknown) => e)
    service = new ObjectiveProposalsService(
      proposals as never,
      objectives as never,
      ctx as unknown as WorkspaceContextService,
    )
  })

  describe('propose', () => {
    it('stores a pending proposal and leaves the current target untouched', async () => {
      proposals.findOne.mockResolvedValue(null)
      const out = await service.propose('u1', { user_id: 'u2', period_month: '2026-10-01', target_revenue: 60000 })
      expect(out).toMatchObject({ status: 'proposed', user_id: 'u2', proposed_by: 'u1', target_revenue: 60000 })
      expect(objectives.save).not.toHaveBeenCalled()
    })

    it('refuses a caller who does not manage a team', async () => {
      ctx.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'member' })
      await expect(service.propose('u1', { user_id: 'u2', target_revenue: 1 })).rejects.toBeInstanceOf(
        ForbiddenException,
      )
    })

    it('refuses a target who is not a member of the workspace', async () => {
      ctx.getMembership.mockResolvedValue(null)
      await expect(service.propose('u1', { user_id: 'u9', target_revenue: 1 })).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })

    it('refuses a proposal to oneself (one declares one’s own target)', async () => {
      await expect(service.propose('u1', { user_id: 'u1', target_revenue: 1 })).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('refuses an empty proposal — an axis not proposed is null, never 0', async () => {
      await expect(service.propose('u1', { user_id: 'u2' })).rejects.toBeInstanceOf(BadRequestException)
    })

    it('replaces a still-pending proposal for the same member and month instead of stacking', async () => {
      proposals.findOne.mockResolvedValue({ id: 'p0', status: 'proposed', user_id: 'u2', period_month: '2026-10-01' })
      const out = await service.propose('u1', { user_id: 'u2', period_month: '2026-10-01', target_meetings: 10 })
      expect(out.id).toBe('p0')
      expect(out.target_meetings).toBe(10)
    })
  })

  describe('respond', () => {
    const pending = () => ({
      id: 'p1',
      workspace_id: 'ws-1',
      user_id: 'u2',
      proposed_by: 'u1',
      period_month: '2026-10-01',
      target_revenue: '60000',
      target_meetings: 10,
      target_accounts: null,
      target_qualified_needs: null,
      target_placements: null,
      target_margin_percent: null,
      target_consultants_on_mission: null,
      reason: null,
      status: 'proposed',
      responded_at: null,
      created_at: new Date('2026-10-22T10:00:00Z'),
    })

    it('applies only the proposed axes to the member objective when accepted', async () => {
      proposals.findOne.mockResolvedValue(pending())
      objectives.findOne.mockResolvedValue({
        user_id: 'u2',
        workspace_id: 'ws-1',
        period_month: '2026-10-01',
        target_accounts: 4,
        target_revenue: '50000',
      })
      const out = await service.respond('u2', 'p1', 'accepted')
      expect(out.status).toBe('accepted')
      expect(objectives.save).toHaveBeenCalledWith(
        expect.objectContaining({ target_accounts: 4, target_revenue: '60000', target_meetings: 10 }),
      )
    })

    it('changes nothing when refused, and keeps the proposal as archive', async () => {
      proposals.findOne.mockResolvedValue(pending())
      const out = await service.respond('u2', 'p1', 'refused')
      expect(out.status).toBe('refused')
      expect(objectives.save).not.toHaveBeenCalled()
    })

    it('only the proposed member answers', async () => {
      proposals.findOne.mockResolvedValue(pending())
      await expect(service.respond('u3', 'p1', 'accepted')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('an answered proposal cannot be answered twice', async () => {
      proposals.findOne.mockResolvedValue({ ...pending(), status: 'accepted' })
      await expect(service.respond('u2', 'p1', 'refused')).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('reads', () => {
    it('listMine returns only my pending proposals', async () => {
      proposals.find.mockResolvedValue([])
      await service.listMine('u2')
      expect(proposals.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ user_id: 'u2', status: 'proposed' }) }),
      )
    })

    it('listForTeam is reserved to those who manage a team', async () => {
      ctx.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'member' })
      await expect(service.listForTeam('u1', '2026-10-01')).rejects.toBeInstanceOf(ForbiddenException)
    })
  })
})
