import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { WorkspaceRole } from '@bellum/contracts'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { PipeController } from './pipe.controller'

/**
 * L2 Pipe — le pipe de toute l'ÉQUIPE (montants, commerciaux, taux de gain) :
 * même donnée d'équipe, même porte que `contribution`/`chain`/`hygiene` —
 * `team:manage`. Un membre standard reçoit 403.
 */
const HANDLERS = [['by-owner', PipeController.prototype.byOwner]] as const

// Théo D pilotage.A11 / Q5 (Louis 22/10/2026) — CHACUN SON PIPE : l'inspection et le waterfall sont
// ouverts à tout membre, bornés à SES affaires ; seul le classement par commercial reste à l'équipe.
const OWN_SCOPE_HANDLERS = [
  ['inspection', PipeController.prototype.inspection],
  ['waterfall', PipeController.prototype.waterfall],
] as const

describe('PipeController — RBAC (team:manage)', () => {
  let guard: WorkspacePermissionGuard
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>

  const contextFor = (handler: (...args: never[]) => unknown): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => PipeController,
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'user-1' } }) }),
    }) as unknown as ExecutionContext

  const asRole = (role: WorkspaceRole) => {
    workspaces.findOne.mockResolvedValue(null)
    members.findOne.mockResolvedValue({ workspace_id: 'ws-1', user_id: 'user-1', role } as WorkspaceMemberEntity)
  }

  beforeEach(() => {
    workspaces = createMockRepository<WorkspaceEntity>()
    members = createMockRepository<WorkspaceMemberEntity>()
    const context = new WorkspaceContextService(workspaces as never, members as never, createMockRepository() as never)
    guard = new WorkspacePermissionGuard(new Reflector(), context)
  })

  it.each(HANDLERS)('%s déclare team:manage', (_name, handler) => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual(['team:manage'])
  })

  it.each(HANDLERS)('%s → 200 pour un owner', async (_name, handler) => {
    asRole('owner')
    await expect(guard.canActivate(contextFor(handler))).resolves.toBe(true)
  })

  it.each(HANDLERS)('%s → 403 pour un member', async (_name, handler) => {
    asRole('member')
    await expect(guard.canActivate(contextFor(handler))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it.each(OWN_SCOPE_HANDLERS)('%s est ouvert à un member : crm:read, jamais team:manage', async (_name, handler) => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual(['crm:read'])
    asRole('member')
    await expect(guard.canActivate(contextFor(handler))).resolves.toBe(true)
  })

  it.each(OWN_SCOPE_HANDLERS)('%s → 403 pour un viewer (aucune lecture du CRM)', async (_name, handler) => {
    asRole('viewer')
    await expect(guard.canActivate(contextFor(handler))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('un member ne reçoit que SES affaires (inspection et waterfall bornés à son identifiant)', async () => {
    const pipe = { inspection: jest.fn().mockResolvedValue({}), waterfall: jest.fn().mockResolvedValue({}) }
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-9', role: 'member' }),
    }
    const controller = new PipeController(pipe as never, workspaceContext as never)
    await controller.inspection({ userId: 'user-1' } as never)
    await controller.waterfall({ userId: 'user-1' } as never, {} as never)
    expect(pipe.inspection.mock.calls[0]?.[2]).toBe('user-1')
    expect(pipe.waterfall.mock.calls[0]?.[4]).toBe('user-1')
  })

  it('un manager ou un owner voit toute l’équipe (aucun filtre propriétaire)', async () => {
    const pipe = { inspection: jest.fn().mockResolvedValue({}), waterfall: jest.fn().mockResolvedValue({}) }
    for (const role of ['owner', 'admin']) {
      const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-9', role }) }
      const controller = new PipeController(pipe as never, workspaceContext as never)
      await controller.inspection({ userId: 'user-1' } as never)
      await controller.waterfall({ userId: 'user-1' } as never, {} as never)
    }
    for (const call of pipe.inspection.mock.calls) expect(call[2]).toBeUndefined()
    for (const call of pipe.waterfall.mock.calls) expect(call[4]).toBeUndefined()
  })

  it('le workspace passé au service est celui de l’appelant, jamais un paramètre', async () => {
    const pipe = { waterfall: jest.fn().mockResolvedValue({}) }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-9' }) }
    const controller = new PipeController(pipe as never, workspaceContext as never)
    await controller.waterfall({ userId: 'user-1' } as never, { from: '2026-10-01', to: '2026-10-14' } as never)
    expect(pipe.waterfall.mock.calls[0]?.[0]).toBe('ws-9')
  })
})
