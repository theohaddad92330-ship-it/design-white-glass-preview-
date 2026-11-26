import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { groupPerimeterSchema } from '@bellum/contracts'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { DEMO_GROUP_PERIMETER } from '../demo/demo-dataset'
import { AccountGroupPerimeterController } from './account-group-perimeter.controller'

/**
 * Lot 757 — CONTACTS 3/6 (arbitrage Louis 31/10) : GET group-perimeter/:siren nourrit le sélecteur groupe +
 * filiales de l'analyse. Lecture du registre public, aucune donnée d'espace : le droit est celui de LANCER une
 * analyse (`analysis:run`), l'espace de démonstration ne fait AUCUN appel réseau (craft rule n°9).
 */
function build(over: { demo?: boolean; role?: string; perimeter?: unknown } = {}) {
  const ia = { groupPerimeter: jest.fn().mockResolvedValue(over.perimeter ?? null) }
  const workspace = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: over.role ?? 'sales' }),
    assertPermission: jest.fn().mockImplementation(async () => {
      if (over.role === 'viewer') throw new ForbiddenException('Rôle insuffisant pour cette action')
      return {}
    }),
    isDemoWorkspace: jest.fn().mockResolvedValue(over.demo === true),
    extraPermissionsOf: jest.fn().mockResolvedValue([]),
  }
  const controller = new AccountGroupPerimeterController(ia as never, workspace as never)
  return { controller, ia, workspace }
}

const user = { userId: 'user-1' } as never

describe('lot 757 — GET group-perimeter/:siren', () => {
  it('rend le périmètre lu par le moteur, validé par le contrat partagé', async () => {
    const perimeter = groupPerimeterSchema.parse(DEMO_GROUP_PERIMETER)
    const { controller, ia } = build({ perimeter })
    await expect(controller.perimeter('552120222', user)).resolves.toEqual(perimeter)
    expect(ia.groupPerimeter).toHaveBeenCalledWith('552120222')
  })

  it('refuse un SIREN mal formé AVANT tout appel', async () => {
    const { controller, ia } = build()
    await expect(controller.perimeter('DECATHLON', user)).rejects.toBeInstanceOf(BadRequestException)
    expect(ia.groupPerimeter).not.toHaveBeenCalled()
  })

  it('démonstration : le périmètre semé, aucun appel au moteur ; un autre SIREN rend null', async () => {
    const { controller, ia } = build({ demo: true })
    const seeded = await controller.perimeter(DEMO_GROUP_PERIMETER.rootSiren, user)
    expect(groupPerimeterSchema.parse(seeded).entities.length).toBeGreaterThan(1)
    await expect(controller.perimeter('306138900', user)).resolves.toBeNull()
    expect(ia.groupPerimeter).not.toHaveBeenCalled()
  })

  it('## Droits — déclare analysis:run, et un rôle sans ce droit est refusé par la garde', async () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AccountGroupPerimeterController.prototype.perimeter)).toEqual([
      'analysis:run',
    ])
    const { workspace } = build({ role: 'viewer' })
    const guard = new WorkspacePermissionGuard(new Reflector(), workspace as never)
    const ctx = {
      getHandler: () => AccountGroupPerimeterController.prototype.perimeter,
      getClass: () => AccountGroupPerimeterController,
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'user-1' } }) }),
    }
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(ForbiddenException)
  })
})
