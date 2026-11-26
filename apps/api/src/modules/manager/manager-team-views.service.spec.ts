import { ForbiddenException } from '@nestjs/common'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ManagerTeamViewsService } from './manager-team-views.service'

// Théo D team-business + team-plans — les lectures de la direction.
describe('ManagerTeamViewsService', () => {
  let fx: Record<string, unknown[]>
  let queries: string[]
  let ctx: { resolveActiveWorkspace: jest.Mock; extraPermissionsOf: jest.Mock }
  let service: ManagerTeamViewsService

  beforeEach(() => {
    queries = []
    fx = {
      members: [
        { userId: 'u1', role: 'owner', firstName: 'Maëlle', lastName: 'Lorquin', email: 'm@e.fr' },
        { userId: 'u2', role: 'member', firstName: 'Léa', lastName: 'Marchand', email: 'l@e.fr' },
      ],
      objectives: [
        { userId: 'u1', rev: '90000', meet: 8, acc: 4 },
        { userId: 'u2', rev: '60000', meet: null, acc: null },
      ],
      won: [{ userId: 'u1', amount: 71000, valued: 1, total: 1 }],
      meetings: [{ userId: 'u1', count: 1 }],
      newAccounts: [{ userId: 'u1', count: 6 }],
      proposals: [{ userId: 'u2' }],
      deals: [
        {
          id: 'o1',
          label: 'Renfort SAP',
          accountId: 'a1',
          companyName: 'Airbus',
          ownerId: 'u1',
          stage: 'qualification',
          amount: 78000,
          closeOn: new Date(2026, 9, 28),
          nextAction: 'Retour client',
        },
        {
          id: 'o2',
          label: 'Qualité données',
          accountId: 'a2',
          companyName: 'Crédit Agricole',
          ownerId: 'u1',
          stage: 'lead',
          amount: null,
          closeOn: null,
          nextAction: null,
        },
      ],
      accounts: [
        {
          id: 'a1',
          companyName: 'Airbus',
          sector: 'Aéronautique',
          headquarters: 'Toulouse',
          assignedTo: 'u1',
          total: 2,
        },
        { id: 'a2', companyName: 'EDF', sector: 'Énergie', headquarters: null, assignedTo: null, total: 2 },
      ],
      nextActions: [{ id: 'i1', accountId: 'a1', label: 'Relancer Paul', dueDate: new Date(2026, 9, 22) }],
      actions: [
        {
          id: 'i1',
          label: 'Relancer Paul',
          accountId: 'a1',
          companyName: 'Airbus',
          dueDate: new Date(2026, 9, 22),
          overdue: false,
          ownerUserId: 'u1',
          assignedTo: 'u2',
          delegatedBy: 'u1',
          done: false,
        },
      ],
      counts: [{ open: 9, overdue: 1, delegated: 2 }],
    }
    const route = async (sql: string) => {
      queries.push(sql)
      if (sql.includes('FROM workspace_members')) return fx.members
      if (sql.includes('"objectiveRow"')) return fx.objectives
      if (sql.includes('"wonRow"')) return fx.won
      if (sql.includes("'rdv_obtained'")) return fx.meetings
      if (sql.includes('"newAccountsRow"')) return fx.newAccounts
      if (sql.includes('FROM objective_proposals')) return fx.proposals
      if (sql.includes('"dealRow"')) return fx.deals
      if (sql.includes('"nextActionRow"')) return fx.nextActions
      if (sql.includes('"planCounts"')) return fx.counts
      if (sql.includes('"planRow"')) return fx.actions
      if (sql.includes('"portfolioRow"')) return fx.accounts
      return []
    }
    ctx = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      extraPermissionsOf: jest.fn(async () => []),
    }
    service = new ManagerTeamViewsService(
      { query: jest.fn(route) } as never,
      ctx as unknown as WorkspaceContextService,
      { scopeFor: jest.fn(async () => null) } as never,
    )
  })

  describe('getBusiness', () => {
    it('is reserved to those who manage a team', async () => {
      ctx.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'member' })
      await expect(service.getBusiness('u2')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('adds up the declared targets as the cap and the entered won amounts as signed', async () => {
      const out = await service.getBusiness('u1')
      expect(out.cap).toMatchObject({
        signed_amount: 71000,
        target_amount: 150000,
        contributors_with_target: 2,
        members_total: 2,
      })
    })

    it('signed is null — never 0 — for a member with no won deal amount', async () => {
      const out = await service.getBusiness('u1')
      expect(out.members.find(m => m.user_id === 'u1')?.signed_amount).toBe(71000)
      expect(out.members.find(m => m.user_id === 'u2')?.signed_amount).toBeNull()
    })

    it('a missing target stays null (RDV / comptes of Léa), never 0', async () => {
      const out = await service.getBusiness('u1')
      expect(out.members.find(m => m.user_id === 'u2')).toMatchObject({ target_meetings: null, target_accounts: null })
      expect(out.members.find(m => m.user_id === 'u1')).toMatchObject({
        target_meetings: 8,
        achieved_meetings: 1,
        achieved_accounts: 6,
      })
    })

    it('flags the member whose proposed target awaits an answer', async () => {
      const out = await service.getBusiness('u1')
      expect(out.members.find(m => m.user_id === 'u2')?.pending_proposal).toBe(true)
      expect(out.members.find(m => m.user_id === 'u1')?.pending_proposal).toBe(false)
    })

    it('keeps an unpriced deal visible, with null amount and a null decision date', async () => {
      const out = await service.getBusiness('u1')
      expect(out.deals).toHaveLength(2)
      expect(out.deals[1]).toMatchObject({ estimated_amount: null, expected_close_on: null, next_action_label: null })
      expect(out.deals[0]).toMatchObject({ expected_close_on: '2026-10-28', next_action_label: 'Retour client' })
      expect(out.deals_amount).toBe(78000)
      expect(out.deals_without_amount).toBe(1)
    })

    it('lists every portfolio account with its holder and its next action, an unassigned one included', async () => {
      const out = await service.getBusiness('u1')
      expect(out.accounts.find(a => a.id === 'a2')).toMatchObject({ assigned_to: null, next_action: null })
      expect(out.accounts.find(a => a.id === 'a1')?.next_action).toMatchObject({
        label: 'Relancer Paul',
        due_date: '2026-10-22',
      })
    })

    it('never reads a mailbox or a message (c96)', async () => {
      await service.getBusiness('u1')
      expect(queries.join('\n')).not.toMatch(/mailbox_messages|message_drafts|FROM messages|email_threads/i)
    })
  })

  describe('getPlans', () => {
    it('is reserved to those who manage a team', async () => {
      ctx.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role: 'member' })
      await expect(service.getPlans('u2')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('carries counts, who delegated (confié par), and the names to filter and assign with', async () => {
      const out = await service.getPlans('u1')
      expect(out).toMatchObject({ open: 9, overdue: 1, delegated: 2 })
      expect(out.items[0]).toMatchObject({ assigned_to: 'u2', delegated_by: 'u1', due_date: '2026-10-22' })
      expect(out.members.map(m => m.name)).toEqual(['Maëlle Lorquin', 'Léa Marchand'])
    })
  })
})
