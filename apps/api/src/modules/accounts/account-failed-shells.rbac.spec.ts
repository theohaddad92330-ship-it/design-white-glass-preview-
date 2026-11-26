import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { WorkspaceRole } from '@bellum/contracts'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { AccountsController } from './accounts.controller'

/**
 * #4621.3 — PREUVE DU REFUS : l'archivage des coquilles par lot est réservé à l'administration de l'espace.
 * Le VRAI garde, le VRAI Reflector, la VRAIE métadonnée de la route : un rôle ordinaire reçoit un 403.
 */
const USER = 'user-1'
const handler = AccountsController.prototype.archiveFailedShells

describe('POST /accounts/archive-failed-shells — RBAC (team:manage)', () => {
  let guard: WorkspacePermissionGuard
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>

  const context = (): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => AccountsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: USER } }) }),
    }) as unknown as ExecutionContext

  const asRole = (role: WorkspaceRole) => {
    workspaces.findOne.mockResolvedValue(null)
    members.findOne.mockResolvedValue({ workspace_id: 'ws-1', user_id: USER, role } as WorkspaceMemberEntity)
  }

  beforeEach(() => {
    workspaces = createMockRepository<WorkspaceEntity>()
    members = createMockRepository<WorkspaceMemberEntity>()
    guard = new WorkspacePermissionGuard(
      new Reflector(),
      new WorkspaceContextService(workspaces as never, members as never, createMockRepository() as never),
    )
  })

  it('déclare la permission team:manage et branche le garde', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual(['team:manage'])
    expect(Reflect.getMetadata('__guards__', AccountsController)).toContain(WorkspacePermissionGuard)
  })

  it.each<WorkspaceRole>(['owner', 'admin'])('%s → le garde laisse passer', async role => {
    asRole(role)
    await expect(guard.canActivate(context())).resolves.toBe(true)
  })

  it.each<WorkspaceRole>(['member', 'sales', 'tech_admin', 'viewer'])('%s (rôle ordinaire) → 403', async role => {
    asRole(role)
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ForbiddenException)
  })
})
