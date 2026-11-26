/**
 * Capacité « Marchés locaux » (L1) — la surface HTTP : gardée, espace résolu depuis le TOKEN,
 * permission déclarée sur les écritures.
 */
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { MarketBriefController } from './market-brief.controller'
import type { MarketBriefService } from './market-brief.service'

const user = { userId: 'user-1', email: 'rep@esn.fr' } as CurrentUserPayload
const ID = '11111111-1111-4111-8111-111111111111'

function build() {
  const service = {
    list: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({ deleted: true }),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }),
  }
  const controller = new MarketBriefController(service as unknown as MarketBriefService, workspaceContext as never)
  return { controller, service, workspaceContext }
}

describe('MarketBriefController', () => {
  it('est gardé par JwtGuard + WorkspacePermissionGuard', () => {
    const guards = Reflect.getMetadata('__guards__', MarketBriefController) as unknown[]
    expect(guards).toContain(JwtGuard)
    expect(guards).toContain(WorkspacePermissionGuard)
  })

  it('créer et supprimer exigent records:write', () => {
    for (const handler of [MarketBriefController.prototype.create, MarketBriefController.prototype.remove]) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual(['records:write'])
    }
  })

  it('résout l’espace depuis le TOKEN pour chaque route', async () => {
    const { controller, service, workspaceContext } = build()
    await controller.list(user)
    await controller.get(ID, user)
    await controller.create({ label: 'Lille', scope: 'france', departments: ['59'], cantons: [], cities: [] }, user)
    await controller.remove(ID, user)
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledTimes(4)
    const ctx = { userId: 'user-1', workspaceId: 'ws-1' }
    expect(service.list).toHaveBeenCalledWith(ctx)
    expect(service.get).toHaveBeenCalledWith(ctx, ID)
    expect(service.remove).toHaveBeenCalledWith(ctx, ID)
  })
})
