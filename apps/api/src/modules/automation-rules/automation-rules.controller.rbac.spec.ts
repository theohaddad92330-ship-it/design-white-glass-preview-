import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { WorkspaceRole } from '@bellum/contracts'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { AutomationRulesController } from './automation-rules.controller'

/**
 * #2399.6 / #2399.7 — qui voit la comparaison, qui bascule. Ce lot n'élargit AUCUN droit : la bascule garde `messages:send`
 * (comme enregistrer le brouillon et allumer), la comparaison est une lecture de la règle de LA PERSONNE (aucune permission
 * d'écriture). Le refus est le code HTTP du dépôt (403), pas une liste vide silencieuse.
 */
const WS = 'ws-1'
const USER = 'user-1'

describe('AutomationRulesController — droits de la bascule', () => {
  let guard: WorkspacePermissionGuard
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>

  const contextFor = (handler: (...args: never[]) => unknown): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => AutomationRulesController,
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

  it('la bascule (POST :id/activate-draft) garde messages:send — le droit de modifier la règle, pas davantage', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AutomationRulesController.prototype.activateDraft)).toEqual([
      'messages:send',
    ])
  })

  it('la comparaison (GET :id/switch-preview) ne demande aucun droit d’écriture : qui voit la règle la voit', () => {
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AutomationRulesController.prototype.switchPreview),
    ).toBeUndefined()
  })

  it('REFUSÉ : viewer → 403 sur la bascule', async () => {
    asRole('viewer')
    await expect(
      guard.canActivate(contextFor(AutomationRulesController.prototype.activateDraft)),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('REFUSÉ : viewer → 403 sur la modification du plafond (PATCH), qui devient un brouillon', async () => {
    asRole('viewer')
    await expect(guard.canActivate(contextFor(AutomationRulesController.prototype.update))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('viewer → peut OUVRIR la comparaison (lecture), sans que cela lui donne le droit de basculer', async () => {
    asRole('viewer')
    await expect(guard.canActivate(contextFor(AutomationRulesController.prototype.switchPreview))).resolves.toBe(true)
  })
})
