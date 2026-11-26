import { ForbiddenException } from '@nestjs/common'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { WorkspaceActiveSelectionEntity } from '../../database/entities/workspace-active-selection.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

describe('WorkspaceContextService', () => {
  let service: WorkspaceContextService
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>
  let selections: MockRepository<WorkspaceActiveSelectionEntity>

  beforeEach(() => {
    workspaces = createMockRepository<WorkspaceEntity>()
    members = createMockRepository<WorkspaceMemberEntity>()
    selections = createMockRepository<WorkspaceActiveSelectionEntity>()
    service = new WorkspaceContextService(workspaces as never, members as never, selections as never)
  })

  describe('resolveActiveWorkspace', () => {
    it('returns the workspace the user owns with role owner (today: 1 per user)', async () => {
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-1' } as WorkspaceEntity)
      const result = await service.resolveActiveWorkspace('user-1')
      expect(workspaces.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { owner_user_id: 'user-1' } }))
      expect(result).toEqual({ workspaceId: 'ws-1', role: 'owner' })
      // Owning a workspace short-circuits — no membership lookup needed.
      expect(members.findOne).not.toHaveBeenCalled()
    })

    it('falls back to the oldest membership for an invited-only user (owns none)', async () => {
      workspaces.findOne.mockResolvedValueOnce(null)
      members.findOne.mockResolvedValueOnce({ workspace_id: 'ws-9', role: 'member' } as WorkspaceMemberEntity)
      const result = await service.resolveActiveWorkspace('user-2')
      expect(members.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user_id: 'user-2' }, order: { created_at: 'ASC' } }),
      )
      expect(result).toEqual({ workspaceId: 'ws-9', role: 'member' })
    })

    it('throws Forbidden when the user belongs to no workspace at all', async () => {
      workspaces.findOne.mockResolvedValueOnce(null)
      members.findOne.mockResolvedValueOnce(null)
      await expect(service.resolveActiveWorkspace('ghost')).rejects.toBeInstanceOf(ForbiddenException)
    })

    /**
     * THE regression this whole change exists for. Before the switcher, a user
     * who already had an account and accepted an ESN's invitation got a correct
     * `workspace_members` row — and then kept landing in their own personal
     * workspace forever, because the owned workspace won unconditionally.
     */
    it('honours an explicit selection OVER the owned workspace (the join actually lands)', async () => {
      selections.findOne.mockResolvedValueOnce({
        user_id: 'joiner',
        workspace_id: 'ws-esn',
      } as WorkspaceActiveSelectionEntity)
      members.findOne.mockResolvedValueOnce({ workspace_id: 'ws-esn', role: 'sales' } as WorkspaceMemberEntity)

      const result = await service.resolveActiveWorkspace('joiner')

      expect(result).toEqual({ workspaceId: 'ws-esn', role: 'sales' })
      // The personal workspace was never even consulted — the choice wins.
      expect(workspaces.findOne).not.toHaveBeenCalled()
    })

    it('carries the role of the SELECTED workspace, not owner-by-default', async () => {
      selections.findOne.mockResolvedValueOnce({ workspace_id: 'ws-esn' } as WorkspaceActiveSelectionEntity)
      members.findOne.mockResolvedValueOnce({ workspace_id: 'ws-esn', role: 'viewer' } as WorkspaceMemberEntity)
      await expect(service.resolveActiveWorkspace('joiner')).resolves.toEqual({
        workspaceId: 'ws-esn',
        role: 'viewer',
      })
    })

    /**
     * Seat revoked while the member was parked in that workspace. The selection
     * row still points there; membership no longer backs it. The resolver must
     * refuse it on the very NEXT request — a stale preference row can never keep
     * an ex-member reading a team's data.
     */
    it('discards a selection whose membership is gone (revoked seat) and falls back', async () => {
      selections.findOne.mockResolvedValueOnce({ workspace_id: 'ws-esn' } as WorkspaceActiveSelectionEntity)
      members.findOne.mockResolvedValueOnce(null) // membership revoked
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-personal' } as WorkspaceEntity)

      const result = await service.resolveActiveWorkspace('ex-member')

      expect(result).toEqual({ workspaceId: 'ws-personal', role: 'owner' })
      // and the dangling preference is cleaned up rather than retried forever
      expect(selections.delete).toHaveBeenCalledWith({ user_id: 'ex-member' })
    })

    it('never fails the request when clearing a stale selection errors', async () => {
      selections.findOne.mockResolvedValueOnce({ workspace_id: 'ws-gone' } as WorkspaceActiveSelectionEntity)
      members.findOne.mockResolvedValueOnce(null)
      selections.delete.mockRejectedValueOnce(new Error('db down'))
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-personal' } as WorkspaceEntity)

      await expect(service.resolveActiveWorkspace('user-1')).resolves.toEqual({
        workspaceId: 'ws-personal',
        role: 'owner',
      })
    })
  })

  describe('switchWorkspace', () => {
    it('persists the choice and returns the newly active workspace', async () => {
      members.findOne.mockResolvedValueOnce({ workspace_id: 'ws-esn', role: 'sales' } as WorkspaceMemberEntity)
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-esn', name: 'Skaizen' } as WorkspaceEntity)

      const result = await service.switchWorkspace('joiner', 'ws-esn')

      expect(result).toEqual({ workspaceId: 'ws-esn', workspaceName: 'Skaizen', role: 'sales' })
      expect(selections.upsert).toHaveBeenCalledWith({ user_id: 'joiner', workspace_id: 'ws-esn' }, ['user_id'])
    })

    /**
     * The privacy gate. A switcher must not become a way to read a workspace you
     * were never invited to: the target is proven by `workspace_members` BEFORE
     * anything is written, so a forged id is refused and leaves no trace.
     */
    it('REFUSES a workspace the caller is not a member of, and writes nothing', async () => {
      members.findOne.mockResolvedValueOnce(null)

      await expect(service.switchWorkspace('outsider', 'ws-someone-else')).rejects.toBeInstanceOf(ForbiddenException)

      expect(selections.upsert).not.toHaveBeenCalled()
      expect(selections.save).not.toHaveBeenCalled()
    })

    it('refuses a workspace that does not exist (no selection written)', async () => {
      members.findOne.mockResolvedValueOnce({ workspace_id: 'ws-ghost', role: 'member' } as WorkspaceMemberEntity)
      workspaces.findOne.mockResolvedValueOnce(null)

      await expect(service.switchWorkspace('user-1', 'ws-ghost')).rejects.toThrow()
      expect(selections.upsert).not.toHaveBeenCalled()
    })
  })

  describe('listWorkspaces', () => {
    it('lists every workspace the user belongs to, flagging the active one and their own', async () => {
      members.find.mockResolvedValueOnce([
        { workspace_id: 'ws-personal', role: 'owner' },
        { workspace_id: 'ws-esn', role: 'sales' },
      ] as WorkspaceMemberEntity[])
      workspaces.find
        .mockResolvedValueOnce([{ id: 'ws-personal', name: 'Mon espace', owner_user_id: 'joiner' }] as never)
        .mockResolvedValueOnce([
          { id: 'ws-personal', name: 'Mon espace', owner_user_id: 'joiner' },
          { id: 'ws-esn', name: 'Skaizen', owner_user_id: 'boss' },
        ] as never)
      members._qb.getRawMany.mockResolvedValueOnce([
        { workspaceId: 'ws-personal', count: '1' },
        { workspaceId: 'ws-esn', count: '4' },
      ])
      // active = the ESN (an explicit selection)
      selections.findOne.mockResolvedValueOnce({ workspace_id: 'ws-esn' } as WorkspaceActiveSelectionEntity)
      members.findOne.mockResolvedValueOnce({ workspace_id: 'ws-esn', role: 'sales' } as WorkspaceMemberEntity)

      const result = await service.listWorkspaces('joiner')

      expect(result).toEqual([
        {
          id: 'ws-personal',
          name: 'Mon espace',
          role: 'owner',
          isActive: false,
          isPersonal: true,
          memberCount: 1,
        },
        { id: 'ws-esn', name: 'Skaizen', role: 'sales', isActive: true, isPersonal: false, memberCount: 4 },
      ])
    })

    /**
     * No data loss: joining a team never removes the personal workspace, so the
     * dossiers built before the invitation stay one click away.
     */
    it('still lists the personal workspace after joining a team', async () => {
      members.find.mockResolvedValueOnce([
        { workspace_id: 'ws-personal', role: 'owner' },
        { workspace_id: 'ws-esn', role: 'sales' },
      ] as WorkspaceMemberEntity[])
      workspaces.find
        .mockResolvedValueOnce([{ id: 'ws-personal', name: 'Mon espace', owner_user_id: 'joiner' }] as never)
        .mockResolvedValueOnce([
          { id: 'ws-personal', name: 'Mon espace', owner_user_id: 'joiner' },
          { id: 'ws-esn', name: 'Skaizen', owner_user_id: 'boss' },
        ] as never)
      selections.findOne.mockResolvedValueOnce({ workspace_id: 'ws-esn' } as WorkspaceActiveSelectionEntity)
      members.findOne.mockResolvedValueOnce({ workspace_id: 'ws-esn', role: 'sales' } as WorkspaceMemberEntity)

      const result = await service.listWorkspaces('joiner')

      expect(result.map(w => w.id)).toContain('ws-personal')
      expect(result.find(w => w.id === 'ws-personal')?.isPersonal).toBe(true)
    })

    it('returns an empty list rather than throwing for a user with no workspace', async () => {
      members.find.mockResolvedValueOnce([])
      workspaces.find.mockResolvedValueOnce([])
      await expect(service.listWorkspaces('ghost')).resolves.toEqual([])
    })
  })

  describe('getMembership', () => {
    it('looks up the membership by (user_id, workspace_id)', async () => {
      const row = { id: 'm-1', role: 'admin' } as WorkspaceMemberEntity
      members.findOne.mockResolvedValueOnce(row)
      const result = await service.getMembership('user-1', 'ws-1')
      expect(members.findOne).toHaveBeenCalledWith({ where: { user_id: 'user-1', workspace_id: 'ws-1' } })
      expect(result).toBe(row)
    })
  })

  describe('assertMember', () => {
    it('returns the membership when the user belongs to the workspace', async () => {
      const row = { id: 'm-1', role: 'member' } as WorkspaceMemberEntity
      members.findOne.mockResolvedValueOnce(row)
      await expect(service.assertMember('user-1', 'ws-1')).resolves.toBe(row)
    })

    it('throws Forbidden when the user is not a member', async () => {
      members.findOne.mockResolvedValueOnce(null)
      await expect(service.assertMember('user-1', 'ws-2')).rejects.toBeInstanceOf(ForbiddenException)
    })
  })

  describe('listMembers', () => {
    it('returns members of the active workspace with identity + isSelf flag', async () => {
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-1' } as WorkspaceEntity)
      members._qb.getRawMany.mockResolvedValueOnce([
        { userId: 'user-1', role: 'owner', email: 'owner@esn.fr', firstName: 'Théo', lastName: 'Martin' },
        {
          userId: 'user-2',
          role: 'member',
          crossTeamSupport: true,
          email: 'ops@esn.fr',
          firstName: null,
          lastName: null,
        },
      ])

      const result = await service.listMembers('user-1')

      expect(members._qb.where).toHaveBeenCalledWith('m.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
      expect(result).toEqual([
        {
          userId: 'user-1',
          email: 'owner@esn.fr',
          fullName: 'Théo Martin',
          role: 'owner',
          isSelf: true,
          crossTeamSupport: false,
        },
        {
          userId: 'user-2',
          email: 'ops@esn.fr',
          fullName: null,
          role: 'member',
          isSelf: false,
          crossTeamSupport: true,
        },
      ])
    })

    it('tolerates a missing profile row (null email/name)', async () => {
      workspaces.findOne.mockResolvedValueOnce({ id: 'ws-1' } as WorkspaceEntity)
      members._qb.getRawMany.mockResolvedValueOnce([
        { userId: 'user-9', role: 'admin', email: null, firstName: null, lastName: null },
      ])

      const result = await service.listMembers('user-1')

      expect(result).toEqual([
        { userId: 'user-9', email: null, fullName: null, role: 'admin', isSelf: false, crossTeamSupport: false },
      ])
    })

    it('throws Forbidden when the caller belongs to no workspace', async () => {
      workspaces.findOne.mockResolvedValueOnce(null)
      members.findOne.mockResolvedValueOnce(null)
      await expect(service.listMembers('ghost')).rejects.toBeInstanceOf(ForbiddenException)
    })
  })

  describe('assertRole', () => {
    it('returns the membership when the role is allowed', async () => {
      const row = { id: 'm-1', role: 'owner' } as WorkspaceMemberEntity
      members.findOne.mockResolvedValueOnce(row)
      await expect(service.assertRole('user-1', 'ws-1', ['owner', 'admin'])).resolves.toBe(row)
    })

    it('throws Forbidden when the role is not allowed', async () => {
      members.findOne.mockResolvedValueOnce({ id: 'm-1', role: 'member' } as WorkspaceMemberEntity)
      await expect(service.assertRole('user-1', 'ws-1', ['owner', 'admin'])).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('throws Forbidden when the user is not a member at all', async () => {
      members.findOne.mockResolvedValueOnce(null)
      await expect(service.assertRole('user-1', 'ws-1', ['member'])).rejects.toBeInstanceOf(ForbiddenException)
    })
  })

  describe('assertPermission', () => {
    it('returns the membership when the role grants the permission', async () => {
      const row = { id: 'm-1', role: 'sales' } as WorkspaceMemberEntity
      members.findOne.mockResolvedValueOnce(row)
      await expect(service.assertPermission('user-1', 'ws-1', 'analysis:run')).resolves.toBe(row)
    })

    it('throws Forbidden when the role lacks the permission (sales → billing)', async () => {
      members.findOne.mockResolvedValueOnce({ id: 'm-1', role: 'sales' } as WorkspaceMemberEntity)
      await expect(service.assertPermission('user-1', 'ws-1', 'billing:manage')).rejects.toBeInstanceOf(
        ForbiddenException,
      )
    })

    it('refuses a viewer on every mutation permission (strictly read-only)', async () => {
      for (const perm of [
        'analysis:run',
        'contacts:enrich',
        'data:export',
        'messages:send',
        'team:manage',
        'integrations:manage',
        'billing:manage',
      ] as const) {
        members.findOne.mockResolvedValueOnce({ id: 'm-1', role: 'viewer' } as WorkspaceMemberEntity)
        await expect(service.assertPermission('user-1', 'ws-1', perm)).rejects.toBeInstanceOf(ForbiddenException)
      }
    })

    it('throws Forbidden when the user is not a member at all', async () => {
      members.findOne.mockResolvedValueOnce(null)
      await expect(service.assertPermission('user-1', 'ws-1', 'analysis:run')).rejects.toBeInstanceOf(
        ForbiddenException,
      )
    })
  })
})
