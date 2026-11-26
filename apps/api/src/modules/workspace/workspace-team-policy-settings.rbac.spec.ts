import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { WorkspaceRole } from '@bellum/contracts'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspaceTeamPolicySettingsController } from './workspace-team-policy-settings.controller'
import { WorkspacePermissionGuard } from './workspace-permission.guard'

/**
 * #2770.37 — RBAC de `PATCH /workspaces/team-policy` : la politique d'équipe se
 * saisit par un gestionnaire (`team:manage`), comme la charge commerciale. Même
 * style et même preuve que `workspace-commercial-load-settings.rbac.spec.ts`.
 */
const WS = 'ws-1'
const USER = 'user-1'

describe('PATCH /workspaces/team-policy — RBAC (team:manage)', () => {
  let guard: WorkspacePermissionGuard
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>

  const updateContext = (): ExecutionContext =>
    ({
      getHandler: () => WorkspaceTeamPolicySettingsController.prototype.update,
      getClass: () => WorkspaceTeamPolicySettingsController,
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
      WorkspaceTeamPolicySettingsController.prototype.update,
    )
    expect(permission).toEqual(['team:manage'])
  })

  it('la lecture n’exige aucune permission d’écriture — tout membre voit la politique', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, WorkspaceTeamPolicySettingsController.prototype.get)).toBe(
      undefined,
    )
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

  it('l’écriture passe l’auteur et l’espace ACTIF au service', async () => {
    const settings = { update: jest.fn(async () => ({})), effectiveFor: jest.fn() }
    const context = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WS, role: 'admin' })) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doubles de test
    const controller = new WorkspaceTeamPolicySettingsController(settings as any, context as any)
    await controller.update({ userId: USER } as never, { dailyCallTarget: 20 })
    expect(settings.update).toHaveBeenCalledWith(WS, USER, { dailyCallTarget: 20 })
  })
})
