/**
 * #2366 / #2382 — la surface HTTP du modèle canonique : gardée, permission
 * déclarée sur chaque écriture, espace et rôle résolus depuis le TOKEN (jamais
 * le body), opt-out lu par la porte `ContactStopService`.
 */
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { OutreachMessageController } from './outreach-message.controller'
import type { OutreachMessageService } from './outreach-message.service'

const user = { userId: 'user-1', email: 'rep@esn.fr' } as CurrentUserPayload

function build() {
  const service = {
    create: jest.fn(),
    list: jest.fn().mockResolvedValue([]),
    approveMany: jest.fn(),
    get: jest.fn(),
    revise: jest.fn(),
    transition: jest.fn(),
    history: jest.fn(),
    createCallTask: jest.fn(),
    listCallTasks: jest.fn(),
    transitionCallTask: jest.fn(),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }),
  }
  const contactStops = { stoppedAmong: jest.fn().mockResolvedValue(new Set(['c-1'])) }
  const variables = { set: jest.fn().mockResolvedValue({ id: 'var-1' }), list: jest.fn().mockResolvedValue([]) }
  const controller = new OutreachMessageController(
    service as unknown as OutreachMessageService,
    workspaceContext as never,
    contactStops as never,
    variables as never,
  )
  return { controller, service, contactStops, variables }
}

describe('OutreachMessageController', () => {
  it('#3419.1 — annoter une variable passe par l’espace actif du TOKEN, lire aussi', async () => {
    const { controller, variables } = build()
    const input = {
      name: 'Technologie data',
      value: 'Snowflake',
      source: 'Site client',
      as_of: '2026-09-12',
      confidence: 'probable' as const,
      external_use: 'allowed' as const,
    }
    await controller.setVariable('00000000-0000-4000-8000-000000000001', input, { userId: 'u-1' } as never)
    expect(variables.set).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', workspaceId: 'ws-1' }),
      '00000000-0000-4000-8000-000000000001',
      input,
    )
    await controller.listVariables('00000000-0000-4000-8000-000000000001', { userId: 'u-1' } as never)
    expect(variables.list).toHaveBeenCalled()
  })

  it('est gardé par JwtGuard + WorkspacePermissionGuard', () => {
    const guards = Reflect.getMetadata('__guards__', OutreachMessageController) as unknown[]
    expect(guards).toContain(JwtGuard)
    expect(guards).toContain(WorkspacePermissionGuard)
  })

  it('chaque écriture exige messages:send', () => {
    for (const method of ['create', 'approve', 'revise', 'transition', 'createCall', 'transitionCall'] as const) {
      const handler = OutreachMessageController.prototype[method]
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual(['messages:send'])
    }
  })

  it('résout l’espace et le rôle depuis le token, et lit l’opt-out par la porte (#2382)', async () => {
    const { controller, service, contactStops } = build()
    await controller.list(user, 'blocked')
    const [ctx, stops, view] = service.list.mock.calls[0] as [unknown, (ids: string[]) => Promise<Set<string>>, string]
    expect(ctx).toEqual({ userId: 'user-1', workspaceId: 'ws-1', role: 'sales' })
    expect(view).toBe('blocked')
    expect(await stops(['c-1'])).toEqual(new Set(['c-1']))
    expect(contactStops.stoppedAmong).toHaveBeenCalledWith('ws-1', ['c-1'])
  })

  it('#2366.1 — filtre sur `contact_id`, pour que la fiche Contact lise le même objet', async () => {
    const { controller, service } = build()
    await controller.list(user, undefined, 'c-1')
    expect(service.list.mock.calls[0]?.[3]).toBe('c-1')
  })
})
