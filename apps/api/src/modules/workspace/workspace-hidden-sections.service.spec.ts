import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { WorkspaceHiddenSectionsService } from './workspace-hidden-sections.service'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #2957 (#2179.2/.35) — mirrors `workspace-timezone.service.spec.ts` on
 * purpose: same shape of problem (a workspace-level setting, read by any
 * member, written by owner/admin only).
 */
describe('WorkspaceHiddenSectionsService', () => {
  let service: WorkspaceHiddenSectionsService
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
    service = new WorkspaceHiddenSectionsService(context as unknown as WorkspaceContextService, workspaces as never)
  })

  describe('getHiddenSections', () => {
    it('resolves the active workspace hidden sections', async () => {
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-1', hidden_sections: ['rfp'] } as WorkspaceEntity)

      const result = await service.getHiddenSections('user-1')

      expect(context.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
      expect(result).toEqual({ hiddenSections: ['rfp'] })
    })

    it('degrades to an empty list for a missing workspace row', async () => {
      workspaces.findOne.mockResolvedValueOnce(null)
      const result = await service.getHiddenSections('user-1')
      expect(result).toEqual({ hiddenSections: [] })
    })

    it('drops an unknown value instead of throwing — a stale/corrupt row must never take the whole nav down', async () => {
      workspaces.findOne.mockResolvedValueOnce({
        id: 'ws-1',
        hidden_sections: ['rfp', 'accounts', 'not-a-section'],
      } as unknown as WorkspaceEntity)
      const result = await service.getHiddenSections('user-1')
      expect(result).toEqual({ hiddenSections: ['rfp'] })
    })

    it('degrades to an empty list when the column is not an array', async () => {
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-1', hidden_sections: null } as unknown as WorkspaceEntity)
      const result = await service.getHiddenSections('user-1')
      expect(result).toEqual({ hiddenSections: [] })
    })
  })

  describe('setHiddenSections', () => {
    it('asserts owner/admin, persists the set and returns it', async () => {
      const result = await service.setHiddenSections('user-1', ['rfp'])

      expect(context.assertRole).toHaveBeenCalledWith('user-1', 'ws-1', ['owner', 'admin'])
      expect(workspaces.update).toHaveBeenCalledWith({ id: 'ws-1' }, { hidden_sections: ['rfp'] })
      expect(result).toEqual({ hiddenSections: ['rfp'] })
    })

    it('accepts an empty list — clearing back to « rien masqué »', async () => {
      const result = await service.setHiddenSections('user-1', [])
      expect(workspaces.update).toHaveBeenCalledWith({ id: 'ws-1' }, { hidden_sections: [] })
      expect(result).toEqual({ hiddenSections: [] })
    })

    it('deduplicates before persisting', async () => {
      const result = await service.setHiddenSections('user-1', ['rfp', 'rfp'])
      expect(workspaces.update).toHaveBeenCalledWith({ id: 'ws-1' }, { hidden_sections: ['rfp'] })
      expect(result).toEqual({ hiddenSections: ['rfp'] })
    })

    it('refuses when the caller lacks the owner/admin role (no write)', async () => {
      context.assertRole.mockRejectedValueOnce(new ForbiddenException('Rôle insuffisant pour cette action'))

      await expect(service.setHiddenSections('member-1', ['rfp'])).rejects.toBeInstanceOf(ForbiddenException)
      expect(workspaces.update).not.toHaveBeenCalled()
    })

    it('throws NotFound when the workspace row vanished before the update', async () => {
      workspaces.update.mockResolvedValueOnce({ affected: 0, raw: [], generatedMaps: [] })
      await expect(service.setHiddenSections('user-1', ['rfp'])).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
