import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { WorkspaceRole } from '@bellum/contracts'
import { createMockRepository } from '../../database/test-utils'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ConsultantsController } from './consultants.controller'
import { ConsultantsService } from './consultants.service'

/**
 * #4577 — CORRIGER UNE DONNÉE SUR PLACE : LE REFUS SE PROUVE CÔTÉ API.
 *
 * La fiche Talent s'édite champ par champ (`InlineEditableField`) avec le MÊME `PUT /consultants/:id` que la
 * modale — aucun nouvel endpoint. Le web ne montre le geste qu'avec `records:write`, mais un écran masqué n'est pas
 * une garde : c'est le serveur qui refuse. `consultants.permissions.spec.ts` lit la métadonnée du décorateur ; ce
 * fichier fait passer la VRAIE garde, avec le VRAI Reflector, sur le VRAI gestionnaire `update` — le chemin d'une
 * requête, pas la déclaration d'un décorateur.
 */
const WS = 'ws-1'
const USER = 'user-1'

function guardAs(role: WorkspaceRole) {
  const workspaces = createMockRepository<WorkspaceEntity>()
  const members = createMockRepository<WorkspaceMemberEntity>()
  workspaces.findOne.mockResolvedValue(null)
  members.findOne.mockResolvedValue({ workspace_id: WS, user_id: USER, role } as WorkspaceMemberEntity)
  const context = new WorkspaceContextService(workspaces as never, members as never, createMockRepository() as never)
  return new WorkspacePermissionGuard(new Reflector(), context)
}

function contextFor(handler: () => unknown): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => ConsultantsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { userId: USER } }) }),
  } as unknown as ExecutionContext
}

describe('PUT /consultants/:id — la correction sur place est refusée sans records:write', () => {
  const update = ConsultantsController.prototype.update as unknown as () => unknown

  it.each<WorkspaceRole>(['viewer'])('%s : 403, la garde barre la route avant tout contrôleur', async role => {
    await expect(guardAs(role).canActivate(contextFor(update))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it.each<WorkspaceRole>(['owner', 'admin', 'sales_ops', 'sales'])('%s : passe', async role => {
    await expect(guardAs(role).canActivate(contextFor(update))).resolves.toBe(true)
  })

  it('même droit que « Valider la disponibilité » : le rôle qui peut confirmer peut corriger, pas un autre', async () => {
    const confirm = ConsultantsController.prototype.confirmAvailability as unknown as () => unknown
    for (const role of ['viewer', 'owner', 'admin', 'sales_ops', 'sales', 'member', 'tech_admin'] as WorkspaceRole[]) {
      const canConfirm = await guardAs(role)
        .canActivate(contextFor(confirm))
        .then(
          () => true,
          () => false,
        )
      const canEdit = await guardAs(role)
        .canActivate(contextFor(update))
        .then(
          () => true,
          () => false,
        )
      expect({ role, canEdit }).toEqual({ role, canEdit: canConfirm })
    }
  })
})

describe('ConsultantsService.update — le filtre d’espace est posé au plus près de la donnée', () => {
  /** Un dépôt dont la requête ne rend rien : la fiche d'un AUTRE espace n'est pas visible. */
  function serviceSeeingNothing() {
    const andWhere = jest.fn()
    const save = jest.fn()
    const builder: Record<string, jest.Mock> = {}
    builder.where = jest.fn(() => builder)
    builder.andWhere = andWhere.mockImplementation(() => builder)
    builder.getOne = jest.fn(async () => null)
    const repo = { createQueryBuilder: () => builder, save, findOne: jest.fn() }
    const service = new ConsultantsService(
      repo as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    )
    return { service, andWhere, save, repo }
  }

  it('l’id d’une fiche d’un autre espace n’écrit rien : la requête porte l’espace, le résultat est « introuvable »', async () => {
    const { service, andWhere, save } = serviceSeeingNothing()

    const result = await service.update('fiche-d-un-autre-espace', WS, USER, { full_name: 'Intrus', tjm: 1 } as never)

    expect(result).toBeNull()
    expect(save).not.toHaveBeenCalled()
    // Jamais un `where { id }` seul : le prédicat d'espace est dans la requête qui lit la fiche.
    expect(andWhere).toHaveBeenCalledWith(expect.stringContaining('workspace_id = :workspaceId'), {
      workspaceId: WS,
      userId: USER,
    })
  })
})
