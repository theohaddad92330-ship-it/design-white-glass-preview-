/**
 * #3427 — la surface HTTP : gardée, espace et rôle résolus depuis le TOKEN
 * (jamais le body), permission déclarée sur l'écriture.
 */
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { MessageLibraryController } from './message-library.controller'
import type { MessageLibraryService } from './message-library.service'

const user = { userId: 'user-1', email: 'rep@esn.fr' } as CurrentUserPayload

function build() {
  const service = {
    create: jest.fn(),
    list: jest.fn().mockResolvedValue([]),
    get: jest.fn(),
    select: jest.fn(),
    render: jest.fn(),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }),
  }
  const controller = new MessageLibraryController(
    service as unknown as MessageLibraryService,
    workspaceContext as never,
  )
  return { controller, service, workspaceContext }
}

describe('MessageLibraryController', () => {
  it('est gardé par JwtGuard + WorkspacePermissionGuard', () => {
    const guards = Reflect.getMetadata('__guards__', MessageLibraryController) as unknown[]
    expect(guards).toContain(JwtGuard)
    expect(guards).toContain(WorkspacePermissionGuard)
  })

  it('créer une entrée exige records:write', () => {
    const handler = MessageLibraryController.prototype.create
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual(['records:write'])
  })

  it('résout l’espace et le rôle depuis le TOKEN, jamais depuis le corps', async () => {
    const { controller, service, workspaceContext } = build()
    await controller.list(user)
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
    expect(service.list).toHaveBeenCalledWith({ userId: 'user-1', workspaceId: 'ws-1', role: 'sales' })
  })

  it('select() transmet les critères structurés au service, sans y toucher', async () => {
    const { controller, service } = build()
    const criteria = { channel: 'linkedin_draft', scenarioId: 'accepted_connection', persona: 'decideur' } as const
    await controller.select(criteria, user)
    expect(service.select).toHaveBeenCalledWith({ userId: 'user-1', workspaceId: 'ws-1', role: 'sales' }, criteria)
  })

  it('render() transmet les variables déclarées, jamais un texte réécrit', async () => {
    const { controller, service } = build()
    await controller.render('entry-1', { variables: { Prenom: 'Julie' } }, user)
    expect(service.render).toHaveBeenCalledWith({ userId: 'user-1', workspaceId: 'ws-1', role: 'sales' }, 'entry-1', {
      Prenom: 'Julie',
    })
  })
})
