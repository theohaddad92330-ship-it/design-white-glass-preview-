import { NotFoundException } from '@nestjs/common'
import { MIN_DISTINCT_SESSIONS_FOR_A_METRIC } from '@bellum/contracts'
import { createMockRepository } from '../../database/test-utils'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import { TeamKpisService } from './team-kpis.service'

/** Route each markered SQL query of the TEAMS summary to its seeded rows.
 *  ws-2 intentionally has NO rows in any aggregate → zeros + null rates. */
function seededTeamsQuery(sql: string): unknown[] {
  if (sql.includes('q:teams')) {
    return [
      { workspaceId: 'ws-1', workspaceName: 'ESN Alpha', memberCount: 2 },
      { workspaceId: 'ws-2', workspaceName: 'ESN Beta', memberCount: 1 },
    ]
  }
  if (sql.includes('q:runs_ws')) return [{ workspaceId: 'ws-1', started: 8, completed: 6 }]
  if (sql.includes('q:accounts_ws')) {
    return [
      { workspaceId: 'ws-1', status: 'completed', commercialStatus: 'inbox', count: 9 },
      { workspaceId: 'ws-1', status: 'completed', commercialStatus: 'opportunity', count: 3 },
    ]
  }
  if (sql.includes('q:enriched_ws')) return [{ workspaceId: 'ws-1', enriched: 25 }]
  if (sql.includes('q:actions_ws')) {
    // 10 envois = 6 expédiés par Bellum + 3 auto-déclarés + 1 historique non
    // traçable. Le total reste 10 : c'est la décomposition qui rend le chiffre
    // lisible, pas un filtrage silencieux.
    return [
      {
        workspaceId: 'ws-1',
        messagesSent: 10,
        messagesVerified: 6,
        messagesDeclared: 3,
        messagesUnattributed: 1,
        responses: 4,
        rdv: 2,
        deals: 1,
      },
    ]
  }
  if (sql.includes('q:credits_ws')) return [{ workspaceId: 'ws-1', consumed: 14 }]
  if (sql.includes('q:activation_ws')) return [{ workspaceId: 'ws-1', onboarded: 2, activated: 1 }]
  return []
}

/** Route each markered SQL query of the DETAIL drill-down to its seeded rows.
 *  u2 has no activity rows; `u-gone` (departed member) only shows in aggregates;
 *  one credit row has a NULL actor → unattributed. */
function seededDetailQuery(sql: string): unknown[] {
  if (sql.includes('q:workspace')) return [{ id: 'ws-1', name: 'ESN Alpha' }]
  if (sql.includes('q:members')) {
    return [
      { userId: 'u1', role: 'owner', firstName: 'Alice', lastName: 'Martin', email: 'alice@esn.fr' },
      { userId: 'u2', role: 'member', firstName: null, lastName: null, email: 'bob@esn.fr' },
    ]
  }
  if (sql.includes('q:runs_member')) {
    return [
      { userId: 'u1', started: 5, completed: 4 },
      { userId: 'u-gone', started: 2, completed: 2 },
    ]
  }
  if (sql.includes('q:accounts_member')) {
    return [
      { userId: 'u1', status: 'completed', commercialStatus: 'inbox', count: 5 },
      { userId: 'u1', status: 'completed', commercialStatus: 'opportunity', count: 2 },
    ]
  }
  if (sql.includes('q:enriched_member')) return [{ userId: 'u1', enriched: 12 }]
  if (sql.includes('q:actions_member')) {
    return [
      {
        userId: 'u1',
        messagesSent: 8,
        messagesVerified: 5,
        messagesDeclared: 2,
        messagesUnattributed: 1,
        responses: 2,
        rdv: 1,
        deals: 0,
      },
    ]
  }
  if (sql.includes('q:credits_member')) {
    return [
      { userId: 'u1', consumed: 9 },
      { userId: null, consumed: 3 },
    ]
  }
  if (sql.includes('q:activation_member')) {
    return [{ userId: 'u1', onboardedAt: '2026-06-01T10:00:00.000Z', activatedAt: '2026-06-02T09:00:00.000Z' }]
  }
  if (sql.includes('q:last_activity')) return [{ userId: 'u1', lastAt: '2026-07-15T09:00:00.000Z' }]
  if (sql.includes('q:pipeline')) {
    return [
      { status: 'inbox', count: 5 },
      { status: 'opportunity', count: 2 },
    ]
  }
  // Charge d'actions ouvertes par porteur. `u-gone` a quitté l'équipe mais ses
  // 4 actions sont toujours ouvertes : personne ne les voit plus passer.
  if (sql.includes('q:workload_member')) {
    return [
      { userId: 'u1', open: 6, overdue: 2, dueSoon: 3, undated: 1 },
      { userId: 'u-gone', open: 4, overdue: 4, dueSoon: 0, undated: 0 },
    ]
  }
  // Portefeuille par responsable désigné : u1 en porte 5, 3 comptes n'ont
  // aucun responsable (bucket NULL). u2 n'apparaît pas → 0, pas une part.
  if (sql.includes('q:portfolio_member')) {
    return [
      { userId: 'u1', count: 5 },
      { userId: null, count: 3 },
    ]
  }
  return []
}

function makeService(router: (sql: string) => unknown[]) {
  const repo = createMockRepository<ProductEventEntity>()
  repo.manager.query.mockImplementation((sql: string) => Promise.resolve(router(sql)))
  const service = new TeamKpisService(repo as never)
  return { service, repo }
}

describe('TeamKpisService.getTeams', () => {
  it('aggregates seeded events/runs/actions/credits per workspace', async () => {
    const { service } = makeService(seededTeamsQuery)
    const summary = await service.getTeams(30)

    expect(summary.windowDays).toBe(30)
    expect(summary.teams).toHaveLength(2)

    const alpha = summary.teams[0]
    expect(alpha).toMatchObject({
      workspaceId: 'ws-1',
      workspaceName: 'ESN Alpha',
      memberCount: 2,
      analysesStarted: 8,
      analysesCompleted: 6,
      activeAccounts: 12,
      hotAccounts: 3,
      contactsEnriched: 25,
      messagesSent: 10,
      responsesReceived: 4,
      rdvObtained: 2,
      dealsSigned: 1,
      creditsConsumed: 14,
      onboardedMembers: 2,
      activatedMembers: 1,
    })
    // Derived rates: responses/messages, rdv/messages.
    expect(alpha.responseRate).toBe(0.4)
    expect(alpha.rdvRate).toBe(0.2)
    // #1681.1 — activated/onboarded est RETENU : deux membres onboardés, sous le
    // minimum d'agrégation de la doctrine. « 50 % d'activation » à côté du nom
    // « ESN Alpha » serait une phrase sur UNE personne, lisible par un
    // opérateur. Le taux part, la RAISON reste — et ce n'est pas 0.
    expect(alpha.activationRate).toBeNull()
    expect(alpha.activationWithheld).toEqual({
      kind: 'below_threshold',
      metric: 'activationRate',
      subjects: 2,
      minSubjects: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    })
    // Le total d'envois est TOUJOURS servi avec sa décomposition : sans elle, le
    // KPI mélangerait du prouvé et du déclaratif sans que ça se voie.
    expect(alpha.messages).toEqual({ verified: 6, declared: 3, unattributed: 1, total: 10 })
    expect(alpha.messages.total).toBe(alpha.messagesSent)
  })

  it('reports zeros for a workspace with no activity — and null (never 0) for rates', async () => {
    const { service } = makeService(seededTeamsQuery)
    const summary = await service.getTeams(30)

    const beta = summary.teams[1]
    expect(beta).toMatchObject({
      workspaceId: 'ws-2',
      memberCount: 1,
      analysesStarted: 0,
      analysesCompleted: 0,
      activeAccounts: 0,
      hotAccounts: 0,
      contactsEnriched: 0,
      messagesSent: 0,
      responsesReceived: 0,
      rdvObtained: 0,
      dealsSigned: 0,
      creditsConsumed: 0,
      onboardedMembers: 0,
      activatedMembers: 0,
    })
    // Non-derivable (no messages sent / nobody onboarded) → null, not a made-up 0%.
    expect(beta.responseRate).toBeNull()
    expect(beta.rdvRate).toBeNull()
    expect(beta.activationRate).toBeNull()
    // …et l'absence est NOMMÉE : zéro membre onboardé, pas zéro pour cent.
    expect(beta.activationWithheld?.subjects).toBe(0)
  })

  it('#1681.1 — au-dessus du seuil, le taux d’activation EST publié', async () => {
    // Le témoin qui prouve que le seuil n'est pas un `null` constant déguisé en
    // règle : une garde qui ne sait pas dire OUI ne garde rien.
    const { service } = makeService(sql => {
      if (sql.includes('q:activation_ws')) {
        return [{ workspaceId: 'ws-1', onboarded: MIN_DISTINCT_SESSIONS_FOR_A_METRIC * 2, activated: 5 }]
      }
      return seededTeamsQuery(sql)
    })
    const summary = await service.getTeams(30)
    const alpha = summary.teams[0]!
    expect(alpha.activationWithheld).toBeNull()
    expect(alpha.activationRate).toBe(0.5)
  })

  it('documents the non-derivable metrics in notes instead of fabricating them', async () => {
    const { service } = makeService(seededTeamsQuery)
    const summary = await service.getTeams(30)
    expect(summary.notes.length).toBeGreaterThan(0)
  })

  it('passes the window to every windowed query and clamps garbage to the default', async () => {
    const { service, repo } = makeService(seededTeamsQuery)
    const summary = await service.getTeams(Number.NaN)
    expect(summary.windowDays).toBe(30)

    // Windowed queries carry the clamped window; snapshots (teams list, accounts,
    // activation) are deliberately unwindowed.
    const windowedCalls = repo.manager.query.mock.calls.filter(([sql]) => (sql as string).includes('make_interval'))
    expect(windowedCalls.length).toBeGreaterThan(0)
    for (const [, params] of windowedCalls) {
      expect(params).toEqual([30])
    }
  })
})

describe('TeamKpisService.getTeamDetail', () => {
  it('throws NotFound for an unknown workspace', async () => {
    const { service } = makeService(sql => (sql.includes('q:workspace') ? [] : seededDetailQuery(sql)))
    await expect(service.getTeamDetail('ghost', 30)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('scopes every aggregate query to the requested workspace', async () => {
    const { service, repo } = makeService(seededDetailQuery)
    await service.getTeamDetail('ws-1', 30)

    expect(repo.manager.query.mock.calls.length).toBeGreaterThan(0)
    for (const [, params] of repo.manager.query.mock.calls) {
      expect((params as unknown[])[0]).toBe('ws-1')
    }
  })

  it('assembles per-member KPIs — zeros for inactive members, null for non-derivable fields', async () => {
    const { service } = makeService(seededDetailQuery)
    const detail = await service.getTeamDetail('ws-1', 30)

    expect(detail.workspace).toEqual({ id: 'ws-1', name: 'ESN Alpha', memberCount: 2 })
    // Sorted by messages sent desc → Alice first.
    expect(detail.members.map(m => m.userId)).toEqual(['u1', 'u2'])

    expect(detail.members[0]).toMatchObject({
      userId: 'u1',
      name: 'Alice Martin',
      email: 'alice@esn.fr',
      role: 'owner',
      analysesStarted: 5,
      analysesCompleted: 4,
      activeAccounts: 7,
      hotAccounts: 2,
      contactsEnriched: 12,
      messagesSent: 8,
      responsesReceived: 2,
      rdvObtained: 1,
      dealsSigned: 0,
      creditsConsumed: 9,
      onboardedAt: '2026-06-01T10:00:00.000Z',
      activatedAt: '2026-06-02T09:00:00.000Z',
      lastActivityAt: '2026-07-15T09:00:00.000Z',
    })
    expect(detail.members[0].responseRate).toBe(0.25)
    expect(detail.members[0].rdvRate).toBe(0.13)

    // Bob: no profile name → email local-part; no activity → zeros; no onboarding
    // event (pre-instrumentation) → activation NOT derivable → nulls.
    expect(detail.members[1]).toMatchObject({
      userId: 'u2',
      name: 'bob',
      analysesStarted: 0,
      messagesSent: 0,
      creditsConsumed: 0,
      onboardedAt: null,
      activatedAt: null,
      lastActivityAt: null,
    })
    expect(detail.members[1].responseRate).toBeNull()
    expect(detail.members[1].rdvRate).toBeNull()

    // La décomposition suit le commercial : c'est elle qui empêche d'évaluer
    // Alice sur 8 « envois » dont 2 ne sont que déclarés.
    expect(detail.members[0].messages).toEqual({ verified: 5, declared: 2, unattributed: 1, total: 8 })
    expect(detail.members[1].messages).toEqual({ verified: 0, declared: 0, unattributed: 0, total: 0 })
  })

  it('team totals include departed members and unattributed credits stay separate', async () => {
    const { service } = makeService(seededDetailQuery)
    const detail = await service.getTeamDetail('ws-1', 30)

    // u-gone (2 runs) is no longer a member but their activity is real team output.
    expect(detail.totals.analysesStarted).toBe(7)
    expect(detail.totals.analysesCompleted).toBe(6)
    expect(detail.totals.messagesSent).toBe(8)
    expect(detail.totals.responsesReceived).toBe(2)
    expect(detail.totals.responseRate).toBe(0.25)
    // Les totaux somment la décomposition terme à terme (pas seulement le total).
    expect(detail.totals.messages).toEqual({ verified: 5, declared: 2, unattributed: 1, total: 8 })
    // 9 attributed to u1 + 3 with NULL actor: total is honest, attribution is not invented.
    expect(detail.totals.creditsConsumed).toBe(12)
    expect(detail.unattributedCredits).toBe(3)

    expect(detail.pipeline).toEqual([
      { status: 'inbox', count: 5 },
      { status: 'opportunity', count: 2 },
    ])
    expect(detail.notes.length).toBeGreaterThan(0)
  })

  it('carries the open-action load per commercial and keeps orphaned actions visible', async () => {
    const { service } = makeService(seededDetailQuery)
    const detail = await service.getTeamDetail('ws-1', 30)

    // Alice porte sa charge ; Bob n'a aucune ligne → 0, pas une part inventée.
    expect(detail.members[0].workload).toEqual({ open: 6, overdue: 2, dueSoon: 3, undated: 1 })
    expect(detail.members[1].workload).toEqual({ open: 0, overdue: 0, dueSoon: 0, undated: 0 })

    // La charge d'équipe somme TOUS les porteurs, membres partis compris : une
    // action ouverte reste ouverte quand son porteur s'en va.
    expect(detail.workload).toEqual({ open: 10, overdue: 6, dueSoon: 3, undated: 1 })
    // …et la part orpheline est isolée, jamais réaffectée à un membre présent.
    expect(detail.offTeamOpenActions).toBe(4)
  })

  it('separates the assigned portfolio from account creation, and never spreads unowned accounts', async () => {
    const { service } = makeService(seededDetailQuery)
    const detail = await service.getTeamDetail('ws-1', 30)

    // Portefeuille (assigned_to) ≠ comptes actifs (créateur) : deux grandeurs,
    // deux colonnes. Alice a créé 7 comptes mais n'en porte que 5.
    expect(detail.members[0].portfolioAccounts).toBe(5)
    expect(detail.members[0].activeAccounts).toBe(7)
    expect(detail.members[1].portfolioAccounts).toBe(0)

    // Les comptes sans responsable sont comptés pour ce qu'ils sont.
    expect(detail.portfolio).toEqual({ assigned: 5, unassigned: 3 })
  })
})
