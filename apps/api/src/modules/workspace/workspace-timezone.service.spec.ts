import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { WorkspaceTimezoneService } from './workspace-timezone.service'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #1958.2 — mirrors `workspace-market.service.spec.ts` on purpose: same shape
 * of problem (a workspace-level setting, read by any member, written by
 * owner/admin only).
 */
describe('WorkspaceTimezoneService', () => {
  let service: WorkspaceTimezoneService
  let workspaces: MockRepository<WorkspaceEntity>
  let context: {
    resolveActiveWorkspace: jest.Mock
    assertRole: jest.Mock
  }

  beforeEach(() => {
    workspaces = createMockRepository<WorkspaceEntity>()
    context = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      assertRole: jest.fn().mockResolvedValue({ role: 'owner' }),
    }
    service = new WorkspaceTimezoneService(context as unknown as WorkspaceContextService, workspaces as never)
  })

  describe('getTimezone', () => {
    it('resolves the active workspace timezone', async () => {
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-1', timezone: 'America/Montreal' } as WorkspaceEntity)

      const result = await service.getTimezone('user-1')

      expect(context.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
      expect(result).toEqual({ timezone: 'America/Montreal' })
    })
  })

  describe('resolveForWorkspace', () => {
    it('degrades to null for a null workspace id without hitting the repo', async () => {
      const result = await service.resolveForWorkspace(null)
      expect(result).toEqual({ timezone: null })
      expect(workspaces.findOne).not.toHaveBeenCalled()
    })

    it('degrades to null for a missing workspace row', async () => {
      workspaces.findOne.mockResolvedValueOnce(null)
      const result = await service.resolveForWorkspace('ghost')
      expect(result).toEqual({ timezone: null })
    })

    it('degrades to null when the column is blank — never an invented zone', async () => {
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-1', timezone: '   ' } as WorkspaceEntity)
      const result = await service.resolveForWorkspace('ws-1')
      expect(result).toEqual({ timezone: null })
    })

    it('reads a real timezone unchanged', async () => {
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-2', timezone: 'Asia/Singapore' } as WorkspaceEntity)
      const result = await service.resolveForWorkspace('ws-2')
      expect(result).toEqual({ timezone: 'Asia/Singapore' })
    })
  })

  describe('setTimezone', () => {
    it('asserts owner/admin, persists the timezone and returns it', async () => {
      const result = await service.setTimezone('user-1', 'Asia/Singapore')

      expect(context.assertRole).toHaveBeenCalledWith('user-1', 'ws-1', ['owner', 'admin'])
      expect(workspaces.update).toHaveBeenCalledWith({ id: 'ws-1' }, { timezone: 'Asia/Singapore' })
      expect(result).toEqual({ timezone: 'Asia/Singapore' })
    })

    it('accepts null — clearing the setting back to « rien réglé »', async () => {
      const result = await service.setTimezone('user-1', null)
      expect(workspaces.update).toHaveBeenCalledWith({ id: 'ws-1' }, { timezone: null })
      expect(result).toEqual({ timezone: null })
    })

    it('refuses when the caller lacks the owner/admin role (no write)', async () => {
      context.assertRole.mockRejectedValueOnce(new ForbiddenException('Rôle insuffisant pour cette action'))

      await expect(service.setTimezone('member-1', 'Asia/Singapore')).rejects.toBeInstanceOf(ForbiddenException)
      expect(workspaces.update).not.toHaveBeenCalled()
    })

    it('throws NotFound when the workspace row vanished before the update', async () => {
      workspaces.update.mockResolvedValueOnce({ affected: 0, raw: [], generatedMaps: [] })
      await expect(service.setTimezone('user-1', 'Asia/Singapore')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
