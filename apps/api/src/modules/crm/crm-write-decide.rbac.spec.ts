import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { WorkspaceRole } from '@bellum/contracts'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { CrmController } from './crm.controller'

/**
 * #4714.3 — l'écrasement de la synchro CRM passe par la porte d'écriture : la validation de la
 * prévisualisation suit les droits EXISTANTS de la porte (`data:export`), inchangés. Un membre sans ce
 * droit ne valide pas.
 */
describe('CrmController.decideWrite — #4714.3, les droits de la porte ne bougent pas', () => {
  let guard: WorkspacePermissionGuard
  let members: MockRepository<WorkspaceMemberEntity>
  const handler = CrmController.prototype.decideWrite

  const ctx = (): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => CrmController,
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'user-1' } }) }),
    }) as unknown as ExecutionContext

  const asRole = (role: WorkspaceRole) =>
    members.findOne.mockResolvedValue({ workspace_id: 'ws-1', user_id: 'user-1', role } as WorkspaceMemberEntity)

  beforeEach(() => {
    const workspaces = createMockRepository<WorkspaceEntity>()
    workspaces.findOne.mockResolvedValue(null)
    members = createMockRepository<WorkspaceMemberEntity>()
    const context = new WorkspaceContextService(workspaces as never, members as never, createMockRepository() as never)
    guard = new WorkspacePermissionGuard(new Reflector(), context)
  })

  it('valider une demande d’écriture exige `data:export`, comme avant', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual(['data:export'])
  })

  it('un membre sans droit d’écriture CRM (viewer) ne valide pas', async () => {
    asRole('viewer')
    await expect(guard.canActivate(ctx())).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('un commercial (droit existant) valide', async () => {
    asRole('sales')
    await expect(guard.canActivate(ctx())).resolves.toBe(true)
  })
})
