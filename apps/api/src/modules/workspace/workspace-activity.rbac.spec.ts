import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { WorkspaceRole } from '@bellum/contracts'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspaceController } from './workspace.controller'
import { WorkspacePermissionGuard } from './workspace-permission.guard'

/**
 * RBAC proof for `GET /workspaces/activity` (journal d'activité — Théo p.21):
 * the REAL guard + the REAL Reflector read the REAL metadata off the REAL
 * controller handler, over the real permission matrix. So these tests prove
 * exactly what a client sees — member/viewer/sales/tech_admin get a 403,
 * owner/admin/sales_ops get through — not a mock's opinion.
 */
const WS = 'ws-1'
const USER = 'user-1'

describe('GET /workspaces/activity — RBAC (team:manage)', () => {
  let guard: WorkspacePermissionGuard
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>

  /** ExecutionContext pointing at the REAL `getActivity` handler, so the real
   *  Reflector resolves the actual `@RequirePermission` metadata. */
  const activityContext = (): ExecutionContext =>
    ({
      getHandler: () => WorkspaceController.prototype.getActivity,
      getClass: () => WorkspaceController,
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: USER } }) }),
    }) as unknown as ExecutionContext

  const asRole = (role: WorkspaceRole) => {
    workspaces.findOne.mockResolvedValue(null) // owns nothing → membership row decides
    members.findOne.mockResolvedValue({ workspace_id: WS, user_id: USER, role } as WorkspaceMemberEntity)
  }

  beforeEach(() => {
    workspaces = createMockRepository<WorkspaceEntity>()
    members = createMockRepository<WorkspaceMemberEntity>()
    const context = new WorkspaceContextService(workspaces as never, members as never, createMockRepository() as never)
    guard = new WorkspacePermissionGuard(new Reflector(), context)
  })

  it('declares the team:manage permission on the route', () => {
    // La métadonnée porte une LISTE depuis que plusieurs permissions peuvent
    // ouvrir une route (l'une d'entre elles suffit) — les routes à permission
    // unique gardent leur forme d'écriture, pas leur forme stockée.
    const permission = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, WorkspaceController.prototype.getActivity)
    expect(permission).toEqual(['team:manage'])
  })

  it('wires the permission guard on the route', () => {
    const guards = Reflect.getMetadata('__guards__', WorkspaceController.prototype.getActivity) as unknown[]
    expect(guards).toContain(WorkspacePermissionGuard)
  })

  it.each<WorkspaceRole>(['owner', 'admin', 'sales_ops'])('%s → 200 (guard passes)', async role => {
    asRole(role)
    await expect(guard.canActivate(activityContext())).resolves.toBe(true)
  })

  it.each<WorkspaceRole>(['member', 'sales', 'tech_admin', 'viewer'])('%s → 403', async role => {
    asRole(role)
    await expect(guard.canActivate(activityContext())).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('an owner resolves via the workspaces table (no member row needed) and passes', async () => {
    workspaces.findOne.mockResolvedValue({ id: WS, owner_user_id: USER } as WorkspaceEntity)
    await expect(guard.canActivate(activityContext())).resolves.toBe(true)
  })
})
