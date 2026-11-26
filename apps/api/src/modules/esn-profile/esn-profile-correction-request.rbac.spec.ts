import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { hasPermission, type WorkspaceRole } from '@bellum/contracts'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { EsnProfileController } from './esn-profile.controller'

/**
 * #2018.9 — Tester associé, manager, membre standard, invité lecture seule.
 *
 * `workspace-activity.rbac.spec.ts` couvre une AUTRE surface (`team:manage`,
 * journal d'activité) ; ce fichier tient la même preuve — LE GUARD RÉEL + LE
 * RÉFLECTOR RÉEL sur le VRAI handler du contrôleur — pour le geste que #2018.7
 * ouvre.
 *
 * Quatre rôles, mappés sur les trois seaux que le point demande de distinguer :
 *
 *  - **associé** (`owner`)     → peut ÉCRIRE directement (team:manage)
 *  - **manager** (`sales_ops`) → peut ÉCRIRE directement (team:manage)
 *  - **membre standard** (`member`) → ne peut QUE SIGNALER (profile:report, pas team:manage)
 *  - **invité lecture seule** (`viewer`) → ne peut RIEN faire (ni l'un ni l'autre)
 *
 * Élargir `profile:report` ou `team:manage` à `viewer` fait rougir ce fichier —
 * c'est le test qui sait dire NON.
 */
const WS = 'ws-1'
const USER = 'user-1'

describe('POST /esn-profile/correction-requests — RBAC (profile:report)', () => {
  let guard: WorkspacePermissionGuard
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>

  const correctionContext = (): ExecutionContext =>
    ({
      getHandler: () => EsnProfileController.prototype.reportCorrection,
      getClass: () => EsnProfileController,
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

  it('déclare profile:report sur la route', () => {
    const permission = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, EsnProfileController.prototype.reportCorrection)
    expect(permission).toEqual(['profile:report'])
  })

  it.each<[string, WorkspaceRole]>([
    ['associé (owner)', 'owner'],
    ['manager (sales_ops)', 'sales_ops'],
    ['membre standard (member)', 'member'],
  ])('%s → 200 (peut signaler)', async (_label, role) => {
    asRole(role)
    await expect(guard.canActivate(correctionContext())).resolves.toBe(true)
  })

  it('invité lecture seule (viewer) → 403 (ne peut RIEN faire, pas même signaler)', async () => {
    asRole('viewer')
    await expect(guard.canActivate(correctionContext())).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('un owner résout via la table workspaces (aucune ligne membre nécessaire) et passe', async () => {
    workspaces.findOne.mockResolvedValue({ id: WS, owner_user_id: USER } as WorkspaceEntity)
    await expect(guard.canActivate(correctionContext())).resolves.toBe(true)
  })

  describe('qui peut ÉCRIRE directement le profil canonique (team:manage — canManageCompany)', () => {
    it.each<[string, WorkspaceRole, boolean]>([
      ['associé (owner)', 'owner', true],
      ['manager (sales_ops)', 'sales_ops', true],
      ['membre standard (member)', 'member', false],
      ['invité lecture seule (viewer)', 'viewer', false],
    ])('%s (%s)', (_label, role, canWrite) => {
      expect(hasPermission(role, 'team:manage')).toBe(canWrite)
    })
  })

  describe('les trois seaux, réunis (le résumé que #2018.9 demande)', () => {
    it.each<[string, WorkspaceRole, boolean, boolean]>([
      ['associé', 'owner', true, true],
      ['manager', 'sales_ops', true, true],
      ['membre standard', 'member', false, true],
      ['invité lecture seule', 'viewer', false, false],
    ])('%s (%s)', (_label, role, canWrite, canReport) => {
      expect(hasPermission(role, 'team:manage')).toBe(canWrite)
      expect(hasPermission(role, 'profile:report')).toBe(canReport)
      // Ne peut RIEN faire ⇔ ni écrire ni signaler.
      if (!canWrite && !canReport) {
        expect(hasPermission(role, 'team:manage') || hasPermission(role, 'profile:report')).toBe(false)
      }
    })
  })
})
