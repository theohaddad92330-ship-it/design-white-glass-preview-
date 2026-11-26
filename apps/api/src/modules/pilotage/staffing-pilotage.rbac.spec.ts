import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { WorkspaceRole } from '@bellum/contracts'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { PilotageController } from './pilotage.controller'

/** L3 Staffing — donnée d'ÉQUIPE : `team:manage`, comme `contribution` et `chain`. Un membre → 403. */
describe('PilotageController — staffing RBAC (team:manage)', () => {
  let guard: WorkspacePermissionGuard
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>

  const contextFor = (handler: (...args: never[]) => unknown): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => PilotageController,
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'user-1' } }) }),
    }) as unknown as ExecutionContext

  const asRole = (role: WorkspaceRole) => {
    workspaces.findOne.mockResolvedValue(null)
    members.findOne.mockResolvedValue({ workspace_id: 'ws-1', user_id: 'user-1', role } as WorkspaceMemberEntity)
  }

  beforeEach(() => {
    workspaces = createMockRepository<WorkspaceEntity>()
    members = createMockRepository<WorkspaceMemberEntity>()
    guard = new WorkspacePermissionGuard(
      new Reflector(),
      new WorkspaceContextService(workspaces as never, members as never, createMockRepository() as never),
    )
  })

  const handlers = [
    ['staffing/capacity', PilotageController.prototype.staffingCapacity],
    ['staffing/overview', PilotageController.prototype.staffingOverview],
    ['staffing/tace-threshold', PilotageController.prototype.setTaceThreshold],
  ] as const

  it.each(handlers)('%s déclare team:manage', (_name, handler) => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual(['team:manage'])
  })

  it.each(handlers)('%s : member → 403', async (_name, handler) => {
    asRole('member')
    await expect(guard.canActivate(contextFor(handler))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it.each(handlers)('%s : admin → autorisé', async (_name, handler) => {
    asRole('admin')
    await expect(guard.canActivate(contextFor(handler))).resolves.toBe(true)
  })
})
