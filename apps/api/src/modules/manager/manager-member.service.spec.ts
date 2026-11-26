import { NotFoundException } from '@nestjs/common'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ManagerMemberService } from './manager-member.service'

// Théo D team-member.N1 — la fiche d'un membre, en lecture de ce qu'il a enregistré.
describe('ManagerMemberService', () => {
  let queries: string[]
  let fixtures: Record<string, unknown[]>
  let ctx: { resolveActiveWorkspace: jest.Mock; getMembership: jest.Mock }
  let service: ManagerMemberService

  beforeEach(() => {
    queries = []
    fixtures = {
      profile: [{ role: 'member', firstName: 'Léa', lastName: 'Marchand', email: 'lea@exemple.fr' }],
      accounts: [
        { id: 'a1', companyName: 'Thales', sector: 'Défense', headquarters: 'Paris' },
        { id: 'a2', companyName: 'Alstom', sector: 'Ferroviaire', headquarters: null },
      ],
      nextActions: [{ id: 'i1', accountId: 'a1', label: 'Vérifier le processus', dueDate: new Date(2026, 9, 20) }],
      actions: [
        {
          id: 'i1',
          label: 'Vérifier le processus',
          accountId: 'a1',
          companyName: 'Thales',
          dueDate: new Date(2026, 9, 20),
          overdue: false,
          delegatedBy: 'u1',
        },
      ],
      opps: [
        {
          id: 'o1',
          label: 'Cadrage sécurité',
          accountId: 'a1',
          companyName: 'Thales',
          stage: 'qualification',
          amount: 48000,
        },
      ],
      signed: [{ amount: null, valued: 0 }],
      objective: [{ target_revenue: '60000', target_meetings: 10, target_accounts: null }],
      proposals: [{ count: 1 }],
      integrations: [{ kind: 'mailbox', connectedByMember: true }],
    }
    const route = async (sql: string) => {
      queries.push(sql)
      if (sql.includes('FROM workspace_members')) return fixtures.profile
      if (sql.includes('FROM objective_proposals')) return fixtures.proposals
      if (sql.includes('FROM member_objectives')) return fixtures.objective
      if (sql.includes("o.stage = 'won'")) return fixtures.signed
      if (sql.includes('FROM opportunities')) return fixtures.opps
      if (sql.includes('"delegatedBy"')) return fixtures.actions
      if (sql.includes('"nextAction"')) return fixtures.nextActions
      if (sql.includes('FROM accounts')) return fixtures.accounts
      if (sql.includes('"connectedByMember"')) return fixtures.integrations
      return []
    }
    ctx = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }),
      getMembership: jest.fn().mockResolvedValue({ user_id: 'u2' }),
    }
    service = new ManagerMemberService({ query: jest.fn(route) } as never, ctx as unknown as WorkspaceContextService)
  })

  it('refuses a user who is not a member of the caller’s workspace', async () => {
    ctx.getMembership.mockResolvedValue(null)
    await expect(service.getMember('u1', 'u9')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('any member may read a colleague’s page (Q3) — no team:manage needed', async () => {
    const out = await service.getMember('u1', 'u2')
    expect(out.member).toMatchObject({ user_id: 'u2', name: 'Léa Marchand', role: 'member' })
  })

  it('reads a company without open action as next_action null, not as a fabricated action', async () => {
    const out = await service.getMember('u1', 'u2')
    expect(out.accounts.find(a => a.id === 'a1')?.next_action).toMatchObject({ label: 'Vérifier le processus' })
    expect(out.accounts.find(a => a.id === 'a2')?.next_action).toBeNull()
  })

  it('signed_amount is null — never 0 — when no won deal carries an entered amount', async () => {
    const out = await service.getMember('u1', 'u2')
    expect(out.objective.signed_amount).toBeNull()
    fixtures.signed = [{ amount: 71000, valued: 1 }]
    expect((await service.getMember('u1', 'u2')).objective.signed_amount).toBe(71000)
  })

  it('flags a pending target proposal', async () => {
    expect((await service.getMember('u1', 'u2')).objective.pending_proposal).toBe(true)
  })

  it('carries who delegated an action (confié par)', async () => {
    expect((await service.getMember('u1', 'u2')).actions[0]).toMatchObject({
      delegated_by: 'u1',
      due_date: '2026-10-20',
    })
  })

  it('names integrations by capability only, never a vendor (c96 / no-vendor-names)', async () => {
    const out = await service.getMember('u1', 'u2')
    expect(out.integrations).toEqual([{ kind: 'mailbox', connected_by_member: true }])
  })

  it('never reads a mailbox or a message (c96)', async () => {
    await service.getMember('u1', 'u2')
    const sql = queries.join('\n')
    expect(sql).not.toMatch(/mailbox_messages|message_drafts|FROM messages|inbound_messages|email_threads/i)
  })
})
