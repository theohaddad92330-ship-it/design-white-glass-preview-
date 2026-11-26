import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import type { Reflector } from '@nestjs/core'
import { hasPermission, workspacePermissionValues } from '@bellum/contracts'
import type { WorkspacePermission, WorkspaceRole } from '@bellum/contracts'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspacePermissionGuard } from './workspace-permission.guard'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * The RBAC core. The guard is exercised against the REAL
 * {@link WorkspaceContextService} + the REAL permission matrix from
 * `@bellum/contracts`, so these assertions prove the end-to-end behaviour a
 * client would see (403 vs pass), not a mock's opinion.
 */
const WS = 'ws-1'
const USER = 'user-1'

const ALL_ROLES: readonly WorkspaceRole[] = ['owner', 'admin', 'sales_ops', 'sales', 'tech_admin', 'member', 'viewer']
const ALL_PERMISSIONS: readonly WorkspacePermission[] = workspacePermissionValues

describe('WorkspacePermissionGuard', () => {
  let guard: WorkspacePermissionGuard
  let context: WorkspaceContextService
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>
  let requiredPermission: WorkspacePermission | undefined

  /** A minimal ExecutionContext exposing a request with `user.userId`. */
  const execContext = (userId: string | undefined = USER): ExecutionContext =>
    ({
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ user: userId ? { userId } : undefined }) }),
    }) as unknown as ExecutionContext

  /** Make `resolveActiveWorkspace` + `assertMember` see the caller as `role`. */
  const asRole = (role: WorkspaceRole) => {
    workspaces.findOne.mockResolvedValue(null) // owns nothing → falls back to membership
    members.findOne.mockResolvedValue({ workspace_id: WS, user_id: USER, role } as WorkspaceMemberEntity)
  }

  beforeEach(() => {
    workspaces = createMockRepository<WorkspaceEntity>()
    members = createMockRepository<WorkspaceMemberEntity>()
    context = new WorkspaceContextService(workspaces as never, members as never, createMockRepository() as never)
    requiredPermission = undefined
    const reflector = {
      getAllAndOverride: jest.fn(() => requiredPermission),
    } as unknown as Reflector
    guard = new WorkspacePermissionGuard(reflector, context)
  })

  it('passes an un-annotated route without touching the workspace context', async () => {
    requiredPermission = undefined
    await expect(guard.canActivate(execContext())).resolves.toBe(true)
    expect(workspaces.findOne).not.toHaveBeenCalled()
    expect(members.findOne).not.toHaveBeenCalled()
  })

  it('fails closed (403) when no authenticated user is on the request', async () => {
    requiredPermission = 'analysis:run'
    await expect(guard.canActivate(execContext(undefined))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses (403) a caller who belongs to no workspace', async () => {
    requiredPermission = 'analysis:run'
    workspaces.findOne.mockResolvedValue(null)
    members.findOne.mockResolvedValue(null)
    await expect(guard.canActivate(execContext())).rejects.toBeInstanceOf(ForbiddenException)
  })

  // ---- The exhaustive matrix: every role × every permission -------------- //
  describe('enforces the full role × permission matrix', () => {
    for (const role of ALL_ROLES) {
      for (const permission of ALL_PERMISSIONS) {
        const allowed = hasPermission(role, permission)
        it(`${role} ${allowed ? 'passes' : 'is refused (403) on'} ${permission}`, async () => {
          asRole(role)
          requiredPermission = permission
          if (allowed) {
            await expect(guard.canActivate(execContext())).resolves.toBe(true)
          } else {
            await expect(guard.canActivate(execContext())).rejects.toBeInstanceOf(ForbiddenException)
          }
        })
      }
    }
  })

  // ---- Named, mission-critical cases (readability) ----------------------- //
  describe('viewer is strictly read-only', () => {
    for (const permission of ALL_PERMISSIONS) {
      it(`refuses viewer on ${permission}`, async () => {
        asRole('viewer')
        requiredPermission = permission
        await expect(guard.canActivate(execContext())).rejects.toBeInstanceOf(ForbiddenException)
      })
    }
  })

  describe('sales — commercial usage, no team/billing/integrations', () => {
    it('runs an analysis', async () => {
      asRole('sales')
      requiredPermission = 'analysis:run'
      await expect(guard.canActivate(execContext())).resolves.toBe(true)
    })
    it('enriches / exports / sends', async () => {
      for (const p of ['contacts:enrich', 'data:export', 'messages:send'] as const) {
        asRole('sales')
        requiredPermission = p
        await expect(guard.canActivate(execContext())).resolves.toBe(true)
      }
    })
    it('is refused (403) on billing', async () => {
      asRole('sales')
      requiredPermission = 'billing:manage'
      await expect(guard.canActivate(execContext())).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('is refused (403) on team management', async () => {
      asRole('sales')
      requiredPermission = 'team:manage'
      await expect(guard.canActivate(execContext())).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('is refused (403) on integrations', async () => {
      asRole('sales')
      requiredPermission = 'integrations:manage'
      await expect(guard.canActivate(execContext())).rejects.toBeInstanceOf(ForbiddenException)
    })
  })

  describe('sales_ops — sales + team management', () => {
    it('manages the team', async () => {
      asRole('sales_ops')
      requiredPermission = 'team:manage'
      await expect(guard.canActivate(execContext())).resolves.toBe(true)
    })
    it('runs commercial actions', async () => {
      for (const p of ['analysis:run', 'contacts:enrich', 'data:export', 'messages:send'] as const) {
        asRole('sales_ops')
        requiredPermission = p
        await expect(guard.canActivate(execContext())).resolves.toBe(true)
      }
    })
    it('is still refused (403) on billing and integrations', async () => {
      for (const p of ['billing:manage', 'integrations:manage'] as const) {
        asRole('sales_ops')
        requiredPermission = p
        await expect(guard.canActivate(execContext())).rejects.toBeInstanceOf(ForbiddenException)
      }
    })
  })

  describe('tech_admin — integrations only', () => {
    it('manages integrations', async () => {
      asRole('tech_admin')
      requiredPermission = 'integrations:manage'
      await expect(guard.canActivate(execContext())).resolves.toBe(true)
    })
    it('is refused (403) on commercial + team + billing', async () => {
      for (const p of [
        'analysis:run',
        'contacts:enrich',
        'data:export',
        'messages:send',
        'team:manage',
        'billing:manage',
      ] as const) {
        asRole('tech_admin')
        requiredPermission = p
        await expect(guard.canActivate(execContext())).rejects.toBeInstanceOf(ForbiddenException)
      }
    })
  })

  describe('owner / admin / member keep their pre-RBAC reach (nothing weakened)', () => {
    it('owner and admin pass every permission', async () => {
      for (const role of ['owner', 'admin'] as const) {
        for (const p of ALL_PERMISSIONS) {
          asRole(role)
          requiredPermission = p
          await expect(guard.canActivate(execContext())).resolves.toBe(true)
        }
      }
    })
    /**
     * Les droits que le rôle HISTORIQUE `member` n'a pas.
     *
     * `team:manage` : sa limite d'origine, avant le RBAC.
     *
     * `finance:read` : un droit NOUVEAU (T7, coût chargé et marge). L'accorder
     * ici « pour ne rien affaiblir » ouvrirait d'un coup le coût chargé des
     * consultants à tous les sièges historiques, sans que personne ne l'ait
     * décidé. Un droit qui n'existait pas ne peut pas avoir été « retiré » :
     * la règle « ne rien affaiblir » protège l'existant, elle n'accorde pas le
     * neuf.
     */
    // `finance:write` rejoint `finance:read` : les deux sont des droits NEUFS,
    // et les accorder rétroactivement ouvrirait le coût chargé des consultants
    // — puis le droit de sortir un mois de la surveillance de facturation — à
    // tous les sièges historiques d'un coup, sans que personne ne l'ait décidé.
    //
    // `finance:read:own` (D1 · 26/08/2026) les rejoint pour la MÊME raison, et
    // c'est délibérément strict : elle ne montre que le périmètre de celui qui
    // regarde, donc l'accorder serait presque anodin. Presque — et « presque
    // anodin » appliqué à tous les sièges historiques d'un coup reste une
    // décision que personne n'a prise. Un `member` qui doit voir son chiffre
    // reçoit le rôle `sales`, ou la permission membre par membre.
    const DENIED_TO_LEGACY_MEMBER = new Set(['team:manage', 'finance:read', 'finance:write', 'finance:read:own'])

    it('member passes everything except team management and the new finance right', async () => {
      for (const p of ALL_PERMISSIONS) {
        asRole('member')
        requiredPermission = p
        if (DENIED_TO_LEGACY_MEMBER.has(p)) {
          await expect(guard.canActivate(execContext())).rejects.toBeInstanceOf(ForbiddenException)
        } else {
          await expect(guard.canActivate(execContext())).resolves.toBe(true)
        }
      }
    })
  })
})
