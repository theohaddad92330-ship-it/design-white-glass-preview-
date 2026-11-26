import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common'
import { WorkspaceTeamService } from './workspace-team.service'

/**
 * #2016 — faire entrer la personne dont la demande d'accès est acceptée.
 *
 * Même porte que l'invitation : la permission `team:manage`, la limite de
 * sièges, puis la bascule d'espace actif du NOUVEAU membre — sans elle, il
 * resterait dans son espace personnel vide et n'hériterait de rien (#2016.7).
 */
describe('WorkspaceTeamService.admitJoinRequester (#2016)', () => {
  const build = (over: { memberCount?: number; seats?: number; denied?: boolean; alreadyMember?: boolean } = {}) => {
    const memberRows = Array.from({ length: over.memberCount ?? 1 }, (_, i) => ({ user_id: `u-${i}` }))
    const members = {
      find: jest.fn().mockResolvedValue(memberRows),
      findOne: jest.fn().mockResolvedValue(over.alreadyMember ? { role: 'sales' } : null),
      create: jest.fn((row: Record<string, unknown>) => row),
      save: jest.fn(async (row: Record<string, unknown>) => row),
    }
    const workspaceContext = {
      assertPermission: jest.fn(async () => {
        if (over.denied) throw new ForbiddenException('Rôle insuffisant pour cette action')
        return {}
      }),
      switchWorkspace: jest.fn().mockResolvedValue({}),
    }
    const workspaces = { findOne: jest.fn().mockResolvedValue({ id: 'w-1', name: 'Comet', owner_user_id: 'u-owner' }) }
    const invitations = { find: jest.fn().mockResolvedValue([]) }
    const subscriptions = { findOne: jest.fn().mockResolvedValue({ plan: 'growth', extra_seats: 0 }) }
    const planCatalog = { get: jest.fn().mockResolvedValue({ seats: over.seats ?? 5 }), getOrDefault: jest.fn() }
    const service = new WorkspaceTeamService(
      workspaceContext as never,
      { get: jest.fn() } as never,
      {} as never,
      workspaces as never,
      members as never,
      invitations as never,
      {} as never,
      subscriptions as never,
      planCatalog as never,
      {} as never,
    )
    return { service, members, workspaceContext }
  }

  it('crée l’appartenance en simple membre, puis bascule l’espace actif du nouveau membre', async () => {
    const { service, members, workspaceContext } = build()
    const result = await service.admitJoinRequester('u-admin', 'w-1', 'u-new')
    expect(workspaceContext.assertPermission).toHaveBeenCalledWith('u-admin', 'w-1', 'team:manage')
    expect(members.save).toHaveBeenCalledWith({ workspace_id: 'w-1', user_id: 'u-new', role: 'member' })
    expect(workspaceContext.switchWorkspace).toHaveBeenCalledWith('u-new', 'w-1')
    expect(result).toEqual({ workspaceId: 'w-1', workspaceName: 'Comet', role: 'member' })
  })

  it('refuse sans la permission — et n’écrit rien', async () => {
    const { service, members } = build({ denied: true })
    await expect(service.admitJoinRequester('u-admin', 'w-1', 'u-new')).rejects.toBeInstanceOf(ForbiddenException)
    expect(members.save).not.toHaveBeenCalled()
  })

  it('respecte la limite de sièges, comme l’invitation (402)', async () => {
    const { service, members } = build({ memberCount: 5, seats: 5 })
    const error = await service.admitJoinRequester('u-admin', 'w-1', 'u-new').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpException)
    expect((error as HttpException).getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED)
    expect(members.save).not.toHaveBeenCalled()
  })

  it('une personne déjà membre garde son rôle, sans nouvelle ligne', async () => {
    const { service, members } = build({ alreadyMember: true, memberCount: 5, seats: 5 })
    const result = await service.admitJoinRequester('u-admin', 'w-1', 'u-new')
    expect(members.save).not.toHaveBeenCalled()
    expect(result.role).toBe('sales')
  })
})
