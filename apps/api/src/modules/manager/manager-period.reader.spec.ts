import { ForbiddenException } from '@nestjs/common'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ManagerPeriodReader, periodWindow } from './manager-period.reader'
import { ManagerService } from './manager.service'

/**
 * #4158.37-43 (lot L7) — les lectures de PÉRIODE du tableau `/team`.
 *
 * Chaque requête porte un marqueur `/* team-period:<clé> *\/` : la route du
 * mock se fait sur lui, pas sur un fragment de SQL que d'autres requêtes
 * contiennent aussi.
 */
describe('ManagerPeriodReader', () => {
  let dataSource: { query: jest.Mock }
  let reader: ManagerPeriodReader

  const NOW = new Date('2026-10-14T12:00:00.000Z')

  const route = (fixtures: Record<string, unknown[]>) =>
    dataSource.query.mockImplementation(async (sql: string) => {
      const marker = /team-period:([a-z_]+)/.exec(sql)?.[1]
      return (marker && fixtures[marker]) ?? []
    })

  beforeEach(() => {
    dataSource = { query: jest.fn() }
    reader = new ManagerPeriodReader(dataSource as never)
  })

  it('borne la période et la précédente, de même longueur', () => {
    const w = periodWindow(7, NOW)
    expect(w.since.toISOString()).toBe('2026-10-07T12:00:00.000Z')
    expect(w.previousSince.toISOString()).toBe('2026-09-30T12:00:00.000Z')
  })

  it('compte les cinq indicateurs du pouls contre la période précédente', async () => {
    route({
      pulse_analyses: [{ current: 4, previous: 2 }],
      pulse_actions_done: [{ current: 9, previous: 12 }],
      pulse_meetings: [{ current: 1, previous: 0 }],
      pulse_active_accounts: [{ current: 6, previous: 6 }],
      pulse_open_needs: [{ current: 2, previous: 3 }],
    })
    const pulse = await reader.pulse('ws-1', periodWindow(7, NOW))
    expect(pulse).toEqual({
      analyses: { current: 4, previous: 2 },
      actions_done: { current: 9, previous: 12 },
      meetings_declared: { current: 1, previous: 0 },
      active_accounts: { current: 6, previous: 6 },
      open_needs: { current: 2, previous: 3 },
    })
  })

  it('le RDV obtenu est un geste DÉCLARÉ (rdv_obtained), jamais un événement d’agenda deviné', async () => {
    route({})
    await reader.pulse('ws-1', periodWindow(7, NOW))
    const sql = dataSource.query.mock.calls.map(c => String(c[0])).find(s => s.includes('team-period:pulse_meetings'))
    expect(sql).toContain("action_type = 'rdv_obtained'")
  })

  it('CLOISONNE chaque lecture sur l’espace de l’appelant ($1 = workspace_id)', async () => {
    route({})
    const w = periodWindow(30, NOW)
    await Promise.all([
      reader.pulse('ws-1', w),
      reader.memberPeriodStats('ws-1', w),
      reader.pipelineReview('ws-1'),
      reader.staffing('ws-1'),
      reader.pendingInvitations('ws-1'),
      reader.awaitingEsnProfile('ws-1', []),
      reader.periodActivity('ws-1', w),
    ])
    const calls = dataSource.query.mock.calls
    expect(calls.length).toBeGreaterThan(8)
    for (const [sql, params] of calls) {
      expect(String(sql)).toMatch(/workspace_id = \$1/)
      expect((params as unknown[])[0]).toBe('ws-1')
    }
  })

  it('agrège par membre : actions ouvertes, en retard, activité de la période', async () => {
    route({
      member_actions: [
        { userId: 'u1', open: 5, overdue: 2 },
        { userId: 'u2', open: 1, overdue: 0 },
      ],
      member_activity: [{ userId: 'u1', count: 14 }],
    })
    const stats = await reader.memberPeriodStats('ws-1', periodWindow(7, NOW))
    expect(stats.get('u1')).toEqual({ open: 5, overdue: 2, activity: 14 })
    expect(stats.get('u2')).toEqual({ open: 1, overdue: 0, activity: 0 })
  })

  it('revue de pipeline : trois raisons NOMMÉES, compteurs complets, tête de file', async () => {
    route({
      pipeline_review_counts: [{ total: 3, noNextStep: 2, noActivity: 1, stuck: 2 }],
      pipeline_review_items: [
        {
          opportunityId: 'o1',
          label: 'TMA RH',
          accountId: 'a1',
          companyName: 'Acme',
          stage: 'qualified',
          ownerUserId: null,
          noNextStep: true,
          noActivity: false,
          stuck: true,
          stageEnteredAt: '2026-09-01T00:00:00.000Z',
          lastActivityAt: null,
        },
      ],
    })
    const review = await reader.pipelineReview('ws-1')
    expect(review.total).toBe(3)
    expect(review.counts).toEqual({ no_next_step: 2, no_activity: 1, stuck: 2 })
    expect(review.items[0]).toMatchObject({
      opportunity_id: 'o1',
      owner_user_id: null,
      reasons: ['no_next_step', 'stuck'],
    })
    // Aucune probabilité, aucun montant pondéré dans la requête.
    const sql = dataSource.query.mock.calls.map(c => String(c[0])).join('\n')
    expect(sql).not.toMatch(/probabilit|weighted/i)
  })

  it('staffing : « inconnu » n’est jamais compté disponible', async () => {
    route({ staffing_needs: [{ open: 4 }], staffing_consultants: [{ now: 2, soon: 1 }] })
    expect(await reader.staffing('ws-1')).toEqual({ open_needs: 4, available_now: 2, available_soon: 1 })
    const sql = dataSource.query.mock.calls.map(c => String(c[0])).find(s => s.includes('staffing_consultants'))
    expect(sql).toContain("'immediate'")
    expect(sql).not.toContain("'inconnu'")
  })

  it('invitations en attente : seulement les pending NON expirées', async () => {
    route({ pending_invitations: [{ count: 2 }] })
    expect(await reader.pendingInvitations('ws-1')).toBe(2)
    const sql = String(dataSource.query.mock.calls[0][0])
    expect(sql).toContain("status = 'pending'")
    expect(sql).toContain('expires_at > now()')
  })

  it('attente de la description de l’ESN : rien dès qu’une fiche canonique existe', async () => {
    route({ esn_canonical: [{ id: 'p1' }], esn_waiting: [{ userId: 'u2' }] })
    expect(await reader.awaitingEsnProfile('ws-1', [{ userId: 'u2', role: 'sales' }])).toEqual([])
  })

  it('attente de la description de l’ESN : les membres onboardés sans team:manage', async () => {
    route({ esn_canonical: [], esn_waiting: [{ userId: 'u2' }, { userId: 'u9' }] })
    const waiting = await reader.awaitingEsnProfile('ws-1', [
      { userId: 'u1', role: 'owner' },
      { userId: 'u2', role: 'sales' },
      { userId: 'u9', role: 'admin' },
    ])
    // u9 est admin : c'est lui qui DÉCRIT l'ESN, il n'attend personne.
    expect(waiting).toEqual(['u2'])
  })

  it('fil de la période : total réel et tête datée', async () => {
    route({
      activity_total: [{ total: 31 }],
      activity_items: [
        {
          id: 'e1',
          userId: 'u1',
          actionType: 'rdv_obtained',
          accountId: 'a1',
          companyName: 'Acme',
          createdAt: '2026-10-13T09:00:00.000Z',
        },
      ],
    })
    const feed = await reader.periodActivity('ws-1', periodWindow(7, NOW))
    expect(feed.total).toBe(31)
    expect(feed.items[0]).toMatchObject({ id: 'e1', action_type: 'rdv_obtained', company_name: 'Acme' })
  })
})

describe('ManagerService.getTeamStats — période (lot L7)', () => {
  it('refuse un appelant sans team:manage AVANT toute lecture de période', async () => {
    const dataSource = { query: jest.fn() }
    const workspaceContext = {
      extraPermissionsOf: jest.fn(async () => []),
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-other', role: 'sales' }),
    }
    const service = new ManagerService(
      dataSource as never,
      workspaceContext as unknown as WorkspaceContextService,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )
    await expect(service.getTeamStats('intrus', 30)).rejects.toBeInstanceOf(ForbiddenException)
    expect(dataSource.query).not.toHaveBeenCalled()
  })

  it('lit la période sur l’espace ACTIF de l’appelant et la renvoie', async () => {
    const dataSource = { query: jest.fn(async () => []) }
    const workspaceContext = {
      extraPermissionsOf: jest.fn(async () => []),
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    }
    const service = new ManagerService(
      dataSource as never,
      workspaceContext as unknown as WorkspaceContextService,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )
    const stats = await service.getTeamStats('u1', 30)
    expect(stats.period?.days).toBe(30)
    expect(stats.pulse).toBeDefined()
    expect(stats.pipeline_review).toBeDefined()
    // Aucune requête de période ne lit un autre espace que l'espace actif.
    for (const [sql, params] of dataSource.query.mock.calls as unknown as [string, unknown[]][]) {
      if (sql.includes('team-period:')) expect(params[0]).toBe('ws-1')
    }
  })
})
