import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { WorkspaceRole } from '@bellum/contracts'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspaceReverseMarketSettingsController } from './workspace-reverse-market-settings.controller'
import { WorkspacePermissionGuard } from './workspace-permission.guard'

/**
 * `#2035.10` — RBAC de `PATCH /workspaces/reverse-market-settings`.
 *
 * Le REAL guard + le REAL Reflector lisent la REAL métadonnée sur le REAL
 * handler, contre la REAL matrice — ces tests prouvent ce qu'un appel sans le
 * rôle reçoit vraiment (403), pas l'opinion d'un mock. Même style que
 * `workspace-activity.rbac.spec.ts`.
 */
const WS = 'ws-1'
const USER = 'user-1'

describe('PATCH /workspaces/reverse-market-settings — RBAC (team:manage)', () => {
  let guard: WorkspacePermissionGuard
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>

  const updateContext = (): ExecutionContext =>
    ({
      getHandler: () => WorkspaceReverseMarketSettingsController.prototype.update,
      getClass: () => WorkspaceReverseMarketSettingsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: USER } }) }),
    }) as unknown as ExecutionContext

  const asRole = (role: WorkspaceRole) => {
    workspaces.findOne.mockResolvedValue(null)
    members.findOne.mockResolvedValue({ workspace_id: WS, user_id: USER, role } as WorkspaceMemberEntity)
  }

  beforeEach(() => {
    workspaces = createMockRepository<WorkspaceEntity>()
    members = createMockRepository<WorkspaceMemberEntity>()
    const context = new WorkspaceContextService(workspaces as never, members as never, createMockRepository() as never)
    guard = new WorkspacePermissionGuard(new Reflector(), context)
  })

  it('déclare la permission team:manage sur la route d’écriture', () => {
    const permission = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      WorkspaceReverseMarketSettingsController.prototype.update,
    )
    expect(permission).toEqual(['team:manage'])
  })

  it.each<WorkspaceRole>(['owner', 'admin', 'sales_ops'])('%s → 200 (le rôle porte team:manage)', async role => {
    asRole(role)
    await expect(guard.canActivate(updateContext())).resolves.toBe(true)
  })

  it.each<WorkspaceRole>(['member', 'sales', 'tech_admin', 'viewer'])(
    '%s → 403, un appel sans le rôle ne s’ignore pas',
    async role => {
      asRole(role)
      await expect(guard.canActivate(updateContext())).rejects.toBeInstanceOf(ForbiddenException)
    },
  )
})
