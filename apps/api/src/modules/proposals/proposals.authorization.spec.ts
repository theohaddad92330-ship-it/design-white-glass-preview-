import 'reflect-metadata'
import { ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { WorkspaceRole } from '@bellum/contracts'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { ProposalsController } from './proposals.controller'

/**
 * D39 — qui atteint le studio de proposition, et qui ne l'atteint pas.
 *
 * Le studio portait `@RequirePermission('data:export')` faute de mieux : la
 * matrice n'a AUCUNE permission de lecture, et `data:export` était la seule
 * valeur qui décrive à peu près « le plan sort du produit ». Elle fermait la
 * porte à `viewer` (aucune permission) et `tech_admin` (`integrations:manage`
 * seule) — deux sièges que personne n'avait décidé de fermer sur une lecture.
 *
 * Ce test exerce le VRAI guard, le VRAI `WorkspaceContextService` et le VRAI
 * `Reflector` contre les métadonnées réellement posées sur le contrôleur : ce
 * qu'un client verrait, pas l'opinion d'un mock.
 *
 * ⚠️ Ce que ces assertions prouvent AUSSI : le marqueur n'ouvre rien. Les deux
 * portes qui restent sont l'identité (`JwtGuard`, ici représenté par la présence
 * de `req.user`) et la résolution d'espace SERVER-SIDE — un `workspaceId` que
 * l'appelant ne choisit jamais.
 */
const WS = 'ws-1'
const OTHER_WS = 'ws-2'
const USER = 'user-1'

function permissionGuardFor(handlerName: 'list' | 'get') {
  const workspaces = createMockRepository<WorkspaceEntity>()
  const members = createMockRepository<WorkspaceMemberEntity>()
  const context = new WorkspaceContextService(workspaces as never, members as never, createMockRepository() as never)
  // Le VRAI Reflector : il lit les métadonnées posées sur `ProposalsController`,
  // il ne les récite pas.
  const guard = new WorkspacePermissionGuard(new Reflector(), context)
  const handler = (ProposalsController.prototype as unknown as Record<string, () => unknown>)[handlerName]

  const execContext = (userId: string | undefined = USER): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => ProposalsController,
      switchToHttp: () => ({ getRequest: () => ({ user: userId ? { userId } : undefined }) }),
    }) as unknown as ExecutionContext

  const asRole = (role: WorkspaceRole) => {
    workspaces.findOne.mockResolvedValue(null)
    members.findOne.mockResolvedValue({ workspace_id: WS, user_id: USER, role } as WorkspaceMemberEntity)
  }

  return { guard, execContext, asRole, workspaces, members }
}

describe('Studio de proposition — qui l’atteint après D39', () => {
  const ALL_ROLES: readonly WorkspaceRole[] = ['owner', 'admin', 'sales_ops', 'sales', 'tech_admin', 'member', 'viewer']

  describe('la porte des permissions ne refuse plus personne — il n’y a plus rien à exiger', () => {
    for (const handlerName of ['list', 'get'] as const) {
      for (const role of ALL_ROLES) {
        it(`${role} passe sur ${handlerName}`, async () => {
          const { guard, execContext, asRole } = permissionGuardFor(handlerName)
          asRole(role)
          await expect(guard.canActivate(execContext())).resolves.toBe(true)
        })
      }
    }

    it('`viewer` et `tech_admin` — les deux sièges que `data:export` fermait — passent', async () => {
      for (const role of ['viewer', 'tech_admin'] as const) {
        const { guard, execContext, asRole } = permissionGuardFor('get')
        asRole(role)
        await expect(guard.canActivate(execContext())).resolves.toBe(true)
      }
    })
  })

  describe('ce qui PROTÈGE encore la route', () => {
    it('sans espace, la résolution refuse (403) — le marqueur n’a rien ouvert', async () => {
      const workspaces = createMockRepository<WorkspaceEntity>()
      const members = createMockRepository<WorkspaceMemberEntity>()
      workspaces.findOne.mockResolvedValue(null)
      members.findOne.mockResolvedValue(null)
      const context = new WorkspaceContextService(
        workspaces as never,
        members as never,
        createMockRepository() as never,
      )

      const controller = new ProposalsController({ listCandidates: jest.fn() } as never, context)
      await expect(controller.list({ userId: 'outsider', email: 'x@y.z' } as never)).rejects.toBeInstanceOf(
        ForbiddenException,
      )
    })

    it('un membre d’un AUTRE espace ne lit pas le besoin — 404, jamais 403', async () => {
      // La route ne prend aucun `workspaceId` en paramètre : il est résolu
      // server-side depuis l'identité. Un membre de `ws-2` interroge donc `ws-2`,
      // quel que soit l'identifiant de besoin qu'il présente.
      const workspaces = createMockRepository<WorkspaceEntity>()
      const members = createMockRepository<WorkspaceMemberEntity>()
      workspaces.findOne.mockResolvedValue(null)
      members.findOne.mockResolvedValue({
        workspace_id: OTHER_WS,
        user_id: 'outsider',
        role: 'owner',
      } as WorkspaceMemberEntity)
      const context = new WorkspaceContextService(
        workspaces as never,
        members as never,
        createMockRepository() as never,
      )

      const buildForProject = jest.fn(async (_projectId: string, workspaceId: string) =>
        workspaceId === WS ? { project: { id: 'proj-1' } } : null,
      )
      const controller = new ProposalsController({ buildForProject } as never, context)

      await expect(controller.get('proj-1', { userId: 'outsider', email: 'x@y.z' } as never)).rejects.toBeInstanceOf(
        NotFoundException,
      )
      // La preuve que la portée n'a pas bougé : le service a été interrogé sur
      // l'espace de l'APPELANT, pas sur celui du besoin demandé.
      expect(buildForProject).toHaveBeenCalledWith('proj-1', OTHER_WS)
    })

    it('un `viewer` de l’espace, lui, obtient le plan', async () => {
      const workspaces = createMockRepository<WorkspaceEntity>()
      const members = createMockRepository<WorkspaceMemberEntity>()
      workspaces.findOne.mockResolvedValue(null)
      members.findOne.mockResolvedValue({
        workspace_id: WS,
        user_id: USER,
        role: 'viewer',
      } as WorkspaceMemberEntity)
      const context = new WorkspaceContextService(
        workspaces as never,
        members as never,
        createMockRepository() as never,
      )

      const view = { project: { id: 'proj-1' } }
      const buildForProject = jest.fn(async (_projectId: string, workspaceId: string) =>
        workspaceId === WS ? view : null,
      )
      const controller = new ProposalsController({ buildForProject } as never, context)

      await expect(controller.get('proj-1', { userId: USER, email: 'v@esn.fr' } as never)).resolves.toBe(view)
    })
  })
})
