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
import { WeekDeltaController } from './week-delta.controller'

/**
 * #2206.3 — un membre STANDARD (rôle `member`/`sales`/`viewer`…) ne voit ni les
 * données d'ÉQUIPE ni les données FINANCIÈRES du pilotage.
 *
 * ⚠️ Le gap trouvé : `@RequireFeature('manager_cockpit')` (posé sur la classe)
 * est un palier de PLAN, pas un rôle — `WorkspacePermissionGuard` est
 * fail-open (`workspace-permission.guard.ts`, « A route without
 * @RequirePermission metadata passes untouched »), donc `contribution`,
 * `chain` et `hygiene` répondaient à N'IMPORTE QUEL membre authentifié de
 * l'espace, y compris `sales`/`member`/`viewer`. `metric-series` et
 * `finance-target` (GET) restent VOLONTAIREMENT hors de cette garde : elles
 * portent déjà `@WorkspaceRead()`, une décision D39 documentée dans le
 * contrôleur (« la matrice n'a AUCUNE permission de lecture à donner à des
 * dénombrements d'hygiène »). `rituals` est un dictionnaire statique, sans
 * `@CurrentUser`, sans donnée d'équipe ni financière — hors du périmètre de ce
 * point. `kpi-catalogue` a gagné un `@CurrentUser` le 28/09/2026 (#3271.2-.6)
 * mais reste hors de ce périmètre pour la MÊME raison : il lit le profil de
 * L'APPELANT lui-même pour réordonner (D1), jamais une donnée d'équipe ni
 * financière — voir `pilotage-kpi-focus.spec.ts`.
 *
 * `team:manage` et non une permission neuve : c'est déjà la porte de
 * `ManagerController` (`GET /manager/team-stats`) et de
 * `ObjectivesController` (`GET /objectives/team`), les deux autres routes
 * `manager_cockpit` qui lisent des chiffres d'ÉQUIPE — même donnée, même
 * porte (GA-26).
 */
const WS = 'ws-1'
const USER = 'user-1'

describe('PilotageController — contribution/chain/hygiene RBAC (team:manage)', () => {
  let guard: WorkspacePermissionGuard
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>

  const contextFor = (handler: (...args: never[]) => unknown): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => PilotageController,
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

  it.each([
    ['contribution', PilotageController.prototype.contributionBlock],
    ['chain', PilotageController.prototype.chain],
    ['hygiene', PilotageController.prototype.dataHygiene],
    // #3262.24-28 (épopée #3262, lot R11 29/09) — même donnée d'équipe, même
    // porte que `contribution` juste au-dessus.
    ['review-signals', PilotageController.prototype.reviewSignals],
  ])('%s déclare la permission team:manage', (_name, handler) => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual(['team:manage'])
  })

  it.each<WorkspaceRole>(['owner', 'admin', 'sales_ops'])(
    '%s → 200 sur GET /pilotage/chain (le rôle porte team:manage)',
    async role => {
      asRole(role)
      await expect(guard.canActivate(contextFor(PilotageController.prototype.chain))).resolves.toBe(true)
    },
  )

  it.each<WorkspaceRole>(['member', 'sales', 'tech_admin', 'viewer', 'finance', 'recruiter'])(
    '%s → 403 sur GET /pilotage/chain, un membre standard ne lit pas l’équipe',
    async role => {
      asRole(role)
      await expect(guard.canActivate(contextFor(PilotageController.prototype.chain))).rejects.toBeInstanceOf(
        ForbiddenException,
      )
    },
  )

  it('member → 403 sur GET /pilotage/hygiene', async () => {
    asRole('member')
    await expect(guard.canActivate(contextFor(PilotageController.prototype.dataHygiene))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('member → 403 sur GET /pilotage/contribution', async () => {
    asRole('member')
    await expect(guard.canActivate(contextFor(PilotageController.prototype.contributionBlock))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('member → 403 sur GET /pilotage/review-signals', async () => {
    asRole('member')
    await expect(guard.canActivate(contextFor(PilotageController.prototype.reviewSignals))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })
})

describe('WeekDeltaController — week-delta / month-objective RBAC (team:manage)', () => {
  let guard: WorkspacePermissionGuard
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>

  const contextFor = (handler: (...args: never[]) => unknown): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => WeekDeltaController,
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

  it.each([
    ['week-delta', WeekDeltaController.prototype.delta],
    ['month-objective', WeekDeltaController.prototype.monthObjective],
  ])('%s déclare la permission team:manage', (_name, handler) => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual(['team:manage'])
  })

  it.each<WorkspaceRole>(['owner', 'admin', 'sales_ops'])('%s → 200 sur GET /pilotage/week-delta', async role => {
    asRole(role)
    await expect(guard.canActivate(contextFor(WeekDeltaController.prototype.delta))).resolves.toBe(true)
  })

  it.each<WorkspaceRole>(['member', 'sales', 'viewer', 'finance', 'recruiter'])(
    '%s → 403 sur GET /pilotage/week-delta',
    async role => {
      asRole(role)
      await expect(guard.canActivate(contextFor(WeekDeltaController.prototype.delta))).rejects.toBeInstanceOf(
        ForbiddenException,
      )
    },
  )

  it('member → 403 sur GET /pilotage/month-objective', async () => {
    asRole('member')
    await expect(guard.canActivate(contextFor(WeekDeltaController.prototype.monthObjective))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })
})
