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
 * #2128 — le sélecteur de BU de la fiche compte écrit par `PUT /accounts/:id/business-unit`.
 * Visible et modifiable par qui peut DÉJÀ modifier le compte (`records:write`) ; REFUSÉ (403) à qui ne
 * peut que le lire. LE GARDE RÉEL + LE RÉFLECTEUR RÉEL sur le vrai handler : étendre `records:write` à
 * `viewer` fait rougir ce fichier.
 */
const USER = 'user-1'

describe('PUT /accounts/:id/business-unit — #2128 (records:write)', () => {
  let guard: WorkspacePermissionGuard
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>

  const context = (): ExecutionContext =>
    ({
      getHandler: () => AccountsController.prototype.assignBusinessUnit,
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
    const workspaceContext = new WorkspaceContextService(
      workspaces as never,
      members as never,
      createMockRepository() as never,
    )
    guard = new WorkspacePermissionGuard(new Reflector(), workspaceContext)
  })

  it('déclare records:write sur la route', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AccountsController.prototype.assignBusinessUnit)).toEqual([
      'records:write',
    ])
  })

  it.each<WorkspaceRole>(['owner', 'sales_ops', 'member'])('%s peut modifier le compte → autorisé', async role => {
    asRole(role)
    await expect(guard.canActivate(context())).resolves.toBe(true)
  })

  it('NON : un invité en lecture seule (viewer) reçoit un 403', async () => {
    asRole('viewer')
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ForbiddenException)
  })
})
