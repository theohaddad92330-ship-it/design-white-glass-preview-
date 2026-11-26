import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { WorkspaceRole } from '@bellum/contracts'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WORKSPACE_READ_KEY } from '../../common/decorator/workspace-read.decorator'
import { IntroductionAuthorizationController } from './introduction-authorization.controller'

/**
 * #3690 RÉFUTÉ (recette prod 07/10 soir : 0 « Relais d'introduction » sur
 * une fiche contact qui PORTE une autorisation enregistrée) — la cause n'est
 * ni le composant (`ContactIntroductionRelay`, qui lit bien `data` et montre
 * la carte dès `latest` non nul) ni une condition d'affichage : c'est la
 * ROUTE DE LECTURE elle-même, `GET /contacts/:id/introduction-authorizations`,
 * qui portait `@RequirePermission('records:write')` — une permission
 * d'ÉCRITURE sur une route qui ne fait QUE lire. Exactement l'anti-patron déjà
 * documenté deux fois (`workspace-read.decorator.ts`, D39) : `viewer` (aucune
 * permission) et `tech_admin` (`integrations:manage` seul) n'ont jamais
 * `records:write` et reçoivent donc un 403 silencieux — l'écran ne distingue
 * pas « aucun relais enregistré » de « lecture refusée », donc la carte
 * disparaît comme si rien n'avait jamais été consigné.
 *
 * Toutes les AUTRES routes de `records:write` dans `contacts.controller.ts`
 * gardent une ÉCRITURE (`@Post`/`@Delete`/`@Patch`) ; celle-ci était la seule
 * exception sur un `@Get`. `@WorkspaceRead()` (D39) est le marqueur correct —
 * il n'ouvre ni ne ferme rien à l'exécution, il déclare que la lecture n'a
 * littéralement rien à demander à la matrice RBAC.
 */
const WS = 'ws-1'
const USER = 'user-1'

describe('IntroductionAuthorizationController — #3690, la LECTURE ne demande pas records:write', () => {
  let guard: WorkspacePermissionGuard
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>

  const contextFor = (handler: (...args: never[]) => unknown): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => IntroductionAuthorizationController,
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

  it('GET :id/introduction-authorizations ne déclare aucune permission d’écriture — il se déclare @WorkspaceRead', () => {
    expect(
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, IntroductionAuthorizationController.prototype.list),
    ).toBeUndefined()
    expect(Reflect.getMetadata(WORKSPACE_READ_KEY, IntroductionAuthorizationController.prototype.list)).toBe(true)
  })

  it('POST :id/introduction-authorizations garde records:write — consigner reste une écriture', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, IntroductionAuthorizationController.prototype.create)).toEqual([
      'records:write',
    ])
  })

  it.each<WorkspaceRole>(['viewer', 'tech_admin'])(
    '%s → 200 sur GET /contacts/:id/introduction-authorizations (lecture d’espace, aucun droit d’écriture requis)',
    async role => {
      asRole(role)
      await expect(guard.canActivate(contextFor(IntroductionAuthorizationController.prototype.list))).resolves.toBe(
        true,
      )
    },
  )

  it('viewer → 403 sur POST /contacts/:id/introduction-authorizations (consigner reste records:write)', async () => {
    asRole('viewer')
    await expect(
      guard.canActivate(contextFor(IntroductionAuthorizationController.prototype.create)),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})
