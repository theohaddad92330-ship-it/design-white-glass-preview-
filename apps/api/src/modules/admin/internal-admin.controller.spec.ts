import { NotFoundException } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { DemoSeedService } from '../demo/demo-seed.service'
import { ReflagService } from '../reflag/reflag.service'
import { AdminService } from './admin.service'
import { InternalAdminController } from './internal-admin.controller'

type MockAdminService = {
  getOverview: jest.Mock
  getPlans: jest.Mock
  updatePlan: jest.Mock
  listUsers: jest.Mock
  listWorkspaces: jest.Mock
  getWorkspaceDetail: jest.Mock
  assignPlan: jest.Mock
  createWorkspace: jest.Mock
  renameWorkspace: jest.Mock
  addMember: jest.Mock
  removeMember: jest.Mock
}

type MockDemoSeedService = {
  createDemoWorkspace: jest.Mock
}

describe('InternalAdminController', () => {
  let admin: MockAdminService
  let demoSeed: MockDemoSeedService
  let controller: InternalAdminController
  let reflag: { isConfigured: jest.Mock; listFlags: jest.Mock }

  beforeEach(() => {
    admin = {
      getOverview: jest.fn().mockResolvedValue({ totalUsers: 0, totalWorkspaces: 0, totalAccounts: 0, plans: {} }),
      getPlans: jest.fn().mockResolvedValue([]),
      updatePlan: jest.fn().mockResolvedValue({ key: 'team', price: 30000 }),
      listUsers: jest.fn().mockResolvedValue({ users: [], total: 0 }),
      listWorkspaces: jest.fn().mockResolvedValue({ workspaces: [], total: 0 }),
      getWorkspaceDetail: jest.fn(),
      assignPlan: jest.fn().mockResolvedValue({ userId: 'u1' }),
      createWorkspace: jest.fn().mockResolvedValue({ id: 'w1' }),
      renameWorkspace: jest.fn().mockResolvedValue({ id: 'w1' }),
      addMember: jest.fn().mockResolvedValue({ userId: 'u2', role: 'member' }),
      removeMember: jest.fn().mockResolvedValue({ removed: true }),
    }
    demoSeed = {
      createDemoWorkspace: jest.fn().mockResolvedValue({
        workspaceId: 'w-demo',
        name: 'Démo Bellum',
        ownerUserId: 'u-demo',
        isDemo: true,
        accounts: 3,
        seeded: true,
      }),
    }
    reflag = {
      isConfigured: jest.fn().mockReturnValue(true),
      listFlags: jest.fn().mockReturnValue([{ key: 'export-pdf', enabled: true }]),
    }
    controller = new InternalAdminController(
      admin as unknown as AdminService,
      demoSeed as unknown as DemoSeedService,
      reflag as unknown as ReflagService,
    )
  })

  it('evaluates feature flags for the requested user / workspace', () => {
    const res = controller.getFlags('user-1', 'ws-1')

    expect(reflag.listFlags).toHaveBeenCalledWith({ userId: 'user-1', companyId: 'ws-1' })
    expect(res).toEqual({ configured: true, flags: [{ key: 'export-pdf', enabled: true }] })
  })

  /** An empty list must not read as "no flags" when Reflag simply isn't wired. */
  it('reports Reflag as unconfigured rather than silently returning nothing', () => {
    reflag.isConfigured.mockReturnValue(false)
    reflag.listFlags.mockReturnValue([])

    expect(controller.getFlags()).toEqual({ configured: false, flags: [] })
  })

  it('is guarded by InternalSecretGuard at the class level', () => {
    // `@UseGuards(...)` stores the guard classes under the `__guards__` metadata
    // key. This module is cross-tenant, so losing the guard would expose the
    // whole database — the assertion is a regression tripwire.
    const guards = Reflect.getMetadata('__guards__', InternalAdminController) as unknown[]
    expect(guards).toContain(InternalSecretGuard)
  })

  it('delegates overview to the service', async () => {
    await controller.getOverview()
    expect(admin.getOverview).toHaveBeenCalledTimes(1)
  })

  it('wraps the plans catalog in a { plans } envelope', async () => {
    admin.getPlans.mockResolvedValueOnce([{ key: 'trial', price: 0, accountsLimit: 40, enrichmentCredits: 75 }])
    await expect(controller.getPlans()).resolves.toEqual({
      plans: [{ key: 'trial', price: 0, accountsLimit: 40, enrichmentCredits: 75 }],
    })
  })

  it('edits a plan via PATCH /plans/:key (delegates to the service)', async () => {
    await controller.updatePlan('team', { price: 30000, accounts_limit: 60 } as never)
    expect(admin.updatePlan).toHaveBeenCalledWith('team', { price: 30000, accounts_limit: 60 })
  })

  it('passes the list query straight through', async () => {
    await controller.listUsers({ search: 'ac', limit: 10, offset: 0 })
    expect(admin.listUsers).toHaveBeenCalledWith({ search: 'ac', limit: 10, offset: 0 })
  })

  it('assigns a plan with the userId param and dto plan', async () => {
    await controller.assignPlan('u1', { plan: 'team' })
    expect(admin.assignPlan).toHaveBeenCalledWith('u1', 'team')
  })

  it('defaults the member role to member when omitted', async () => {
    await controller.addMember('w1', { userId: 'u2' })
    expect(admin.addMember).toHaveBeenCalledWith('w1', 'u2', 'member')
  })

  it('removes a member with both path params', async () => {
    await controller.removeMember('w1', 'u2')
    expect(admin.removeMember).toHaveBeenCalledWith('w1', 'u2')
  })

  it('propagates a 404 from the workspace detail lookup', async () => {
    admin.getWorkspaceDetail.mockRejectedValueOnce(new NotFoundException())
    await expect(controller.getWorkspace('ghost')).rejects.toThrow(NotFoundException)
  })

  it('delegates demo-workspace creation (demo mode C1) to DemoSeedService', async () => {
    const result = await controller.createDemoWorkspace({ ownerUserId: 'u-demo', name: 'Démo Bellum' })
    expect(demoSeed.createDemoWorkspace).toHaveBeenCalledWith('u-demo', 'Démo Bellum', { ensureProfile: undefined })
    expect(result).toMatchObject({ workspaceId: 'w-demo', isDemo: true, accounts: 3 })
  })
})
