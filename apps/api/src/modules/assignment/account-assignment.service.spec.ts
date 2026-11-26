import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { IsNull } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountTeamMemberEntity } from '../../database/entities/account-team-member.entity'
import { AccountTeamScopeEntity } from '../../database/entities/account-team-scope.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AccountAssignmentService } from './account-assignment.service'

/**
 * Authorisation rules for "qui porte ce compte". Derived from the RBAC matrix,
 * never from hardcoded role strings — the existing manager gate
 * (`role !== 'owner' && role !== 'admin'`) already diverges from the matrix and
 * wrongly refuses `sales_ops`; this module must not repeat that.
 */
describe('AccountAssignmentService', () => {
  let accounts: { findOne: jest.Mock; update: jest.Mock; manager: { transaction: jest.Mock } }
  let teamUpdate: jest.Mock
  let order: string[]
  let workspaceContext: { resolveActiveWorkspace: jest.Mock; getMembership: jest.Mock }
  let service: AccountAssignmentService

  const ACCOUNT = { id: 'acc-1', workspace_id: 'ws-1', assigned_to: null as string | null }

  const asRole = (role: string, userId = 'u-manager') => {
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role })
    return userId
  }

  beforeEach(() => {
    order = []
    teamUpdate = jest.fn(async () => {
      order.push('team')
    })
    accounts = {
      findOne: jest.fn().mockResolvedValue({ ...ACCOUNT }),
      update: jest.fn(async () => {
        order.push('account')
        return { affected: 1 }
      }),
      // #4996 — l'attribution et l'archivage de la ligne d'équipe partagent UNE transaction.
      manager: {
        transaction: jest.fn(async (work: (m: unknown) => Promise<unknown>) =>
          work({
            update: (entity: unknown, where: unknown, set: unknown) =>
              entity === AccountEntity ? accounts.update(where, set) : teamUpdate(entity, where, set),
          }),
        ),
      },
    }
    workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      getMembership: jest.fn().mockResolvedValue({ user_id: 'u-rep', role: 'sales' }),
    }
    service = new AccountAssignmentService(accounts as never, workspaceContext as unknown as WorkspaceContextService)
  })

  it('lets a manager assign an account to another member', async () => {
    const res = await service.assign(asRole('owner'), 'acc-1', 'u-rep')
    expect(res).toEqual({ id: 'acc-1', assigned_to: 'u-rep' })
    expect(accounts.update).toHaveBeenCalledWith({ id: 'acc-1' }, { assigned_to: 'u-rep' })
  })

  it('lets a manager release an account back to the unassigned queue', async () => {
    accounts.findOne.mockResolvedValue({ ...ACCOUNT, assigned_to: 'u-rep' })
    const res = await service.assign(asRole('admin'), 'acc-1', null)
    expect(res.assigned_to).toBeNull()
    expect(accounts.update).toHaveBeenCalledWith({ id: 'acc-1' }, { assigned_to: null })
  })

  // The matrix grants sales_ops `team:manage`; the legacy manager gate refuses
  // it. Assignment follows the matrix.
  it('treats sales_ops as a manager because the matrix grants it team:manage', async () => {
    await expect(service.assign(asRole('sales_ops'), 'acc-1', 'u-rep')).resolves.toMatchObject({
      assigned_to: 'u-rep',
    })
  })

  it('lets a rep claim an UNASSIGNED account for themselves', async () => {
    const res = await service.assign(asRole('sales', 'u-rep'), 'acc-1', 'u-rep')
    expect(res.assigned_to).toBe('u-rep')
  })

  it('refuses a rep taking an account already held by a colleague', async () => {
    accounts.findOne.mockResolvedValue({ ...ACCOUNT, assigned_to: 'u-other' })
    await expect(service.assign(asRole('sales', 'u-rep'), 'acc-1', 'u-rep')).rejects.toBeInstanceOf(ForbiddenException)
    expect(accounts.update).not.toHaveBeenCalled()
  })

  it('refuses a rep assigning an account to somebody else', async () => {
    await expect(service.assign(asRole('sales', 'u-rep'), 'acc-1', 'u-other')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('lets a rep release the account they hold', async () => {
    accounts.findOne.mockResolvedValue({ ...ACCOUNT, assigned_to: 'u-rep' })
    await expect(service.assign(asRole('sales', 'u-rep'), 'acc-1', null)).resolves.toMatchObject({
      assigned_to: null,
    })
  })

  it("refuses a rep releasing a colleague's account", async () => {
    accounts.findOne.mockResolvedValue({ ...ACCOUNT, assigned_to: 'u-other' })
    await expect(service.assign(asRole('sales', 'u-rep'), 'acc-1', null)).rejects.toBeInstanceOf(ForbiddenException)
  })

  // `viewer` holds no permission at all; `tech_admin` only manages integrations.
  // Neither carries a commercial portfolio.
  it.each(['viewer', 'tech_admin'])('refuses %s outright', async role => {
    await expect(service.assign(asRole(role, 'u-x'), 'acc-1', 'u-x')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses assigning to someone who is not a member of the workspace', async () => {
    workspaceContext.getMembership.mockResolvedValue(null)
    await expect(service.assign(asRole('owner'), 'acc-1', 'stranger')).rejects.toBeInstanceOf(BadRequestException)
    expect(accounts.update).not.toHaveBeenCalled()
  })

  // Workspace scoping is the real security barrier (the API bypasses RLS).
  it('404s on an account outside the caller workspace, without writing', async () => {
    accounts.findOne.mockResolvedValue(null)
    await expect(service.assign(asRole('owner'), 'acc-other-ws', 'u-rep')).rejects.toBeInstanceOf(NotFoundException)
    expect(accounts.update).not.toHaveBeenCalled()
  })

  it('scopes the account lookup by workspace, never by id alone', async () => {
    await service.assign(asRole('owner'), 'acc-1', 'u-rep')
    expect(accounts.findOne).toHaveBeenCalledWith({ where: { id: 'acc-1', workspace_id: 'ws-1' } })
  })

  it('does not check membership when releasing (null target)', async () => {
    accounts.findOne.mockResolvedValue({ ...ACCOUNT, assigned_to: 'u-rep' })
    await service.assign(asRole('owner'), 'acc-1', null)
    expect(workspaceContext.getMembership).not.toHaveBeenCalled()
  })

  // #4158.15 — un compte m'est ASSIGNÉ par un collègue : une notification.
  describe('notification au destinataire (#4158.15)', () => {
    let notify: { notifyAccountAssigned: jest.Mock }
    beforeEach(() => {
      notify = { notifyAccountAssigned: jest.fn().mockResolvedValue(undefined) }
      service = new AccountAssignmentService(
        accounts as never,
        workspaceContext as unknown as WorkspaceContextService,
        notify as never,
      )
    })

    it('un manager assigne à un collègue : le collègue est prévenu, dans le bon espace', async () => {
      await service.assign(asRole('owner'), 'acc-1', 'u-rep')
      expect(notify.notifyAccountAssigned).toHaveBeenCalledTimes(1)
      expect(notify.notifyAccountAssigned).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        actorUserId: 'u-manager',
        recipientUserId: 'u-rep',
        accountId: 'acc-1',
      })
    })

    it('s’assigner un compte à soi-même ne prévient personne', async () => {
      await service.assign(asRole('sales', 'u-rep'), 'acc-1', 'u-rep')
      expect(notify.notifyAccountAssigned).not.toHaveBeenCalled()
    })

    it('libérer un compte ne prévient personne', async () => {
      accounts.findOne.mockResolvedValue({ ...ACCOUNT, assigned_to: 'u-rep' })
      await service.assign(asRole('admin'), 'acc-1', null)
      expect(notify.notifyAccountAssigned).not.toHaveBeenCalled()
    })

    it('ré-assigner au porteur actuel (rien ne change) ne prévient personne', async () => {
      accounts.findOne.mockResolvedValue({ ...ACCOUNT, assigned_to: 'u-rep' })
      await service.assign(asRole('owner'), 'acc-1', 'u-rep')
      expect(notify.notifyAccountAssigned).not.toHaveBeenCalled()
    })

    it('une assignation REFUSÉE ne prévient personne', async () => {
      await expect(service.assign(asRole('sales', 'u-rep'), 'acc-1', 'u-other')).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      expect(notify.notifyAccountAssigned).not.toHaveBeenCalled()
    })
  })

  // #4996 — « responsable ≠ co-équipier » : attribuer à un co-équipier archive sa ligne d'équipe, ses zones restent.
  describe('attribuer le compte à un co-équipier (#4996)', () => {
    it('archive sa ligne d’équipe dans la MÊME transaction, avec l’auteur du geste, sans toucher à ses zones', async () => {
      await service.assign(asRole('owner', 'u-manager'), 'acc-1', 'u-rep')
      expect(accounts.manager.transaction).toHaveBeenCalledTimes(1)
      expect(teamUpdate).toHaveBeenCalledWith(
        AccountTeamMemberEntity,
        { workspace_id: 'ws-1', account_id: 'acc-1', user_id: 'u-rep', removed_at: IsNull() },
        { removed_at: expect.any(Date), removed_by: 'u-manager' },
      )
      expect(teamUpdate.mock.calls.some(c => c[0] === AccountTeamScopeEntity)).toBe(false)
      expect(order).toEqual(['account', 'team'])
    })

    it('libérer le compte (null) n’archive aucune ligne d’équipe', async () => {
      accounts.findOne.mockResolvedValue({ ...ACCOUNT, assigned_to: 'u-rep' })
      await service.assign(asRole('admin'), 'acc-1', null)
      expect(teamUpdate).not.toHaveBeenCalled()
    })

    it('un refus de droit n’ouvre aucune transaction ni n’archive rien (contrôle négatif)', async () => {
      await expect(service.assign(asRole('sales', 'u-rep'), 'acc-1', 'u-autre')).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      expect(accounts.manager.transaction).not.toHaveBeenCalled()
      expect(teamUpdate).not.toHaveBeenCalled()
    })

    it('un compte d’un autre espace reste 404 : rien n’est archivé', async () => {
      accounts.findOne.mockResolvedValue(null)
      await expect(service.assign(asRole('owner'), 'acc-1', 'u-rep')).rejects.toBeInstanceOf(NotFoundException)
      expect(teamUpdate).not.toHaveBeenCalled()
    })
  })
})
