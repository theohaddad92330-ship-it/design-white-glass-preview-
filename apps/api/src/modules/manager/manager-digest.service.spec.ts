import { ManagerDigestService, digestLines, type TeamWeekFacts } from './manager-digest.service'

/**
 * #4158.28 — le digest hebdomadaire du manager.
 *
 * Ce que ces tests tiennent : le dépôt dans l'app ET l'e-mail passent par `TeamNotificationsService` (la préférence et le mailer
 * sont testés dans `team-notifier.service.spec.ts`, #4158.28) ; une mesure ratée
 * n'est pas « 0 » ; aucun nom de commercial ; un espace sous deux membres et une semaine vide ne
 * produisent rien ; chaque requête est bornée à l'espace.
 */
describe('ManagerDigestService', () => {
  const WS = 'ws-1'
  const NOW = new Date('2026-10-19T05:15:00.000Z') // un lundi

  type Member = { user_id: string; role: string; email: string | null }
  const MEMBERS: Member[] = [
    { user_id: 'mgr', role: 'owner', email: 'mgr@esn.fr' },
    { user_id: 'ops', role: 'sales_ops', email: 'ops@esn.fr' },
    { user_id: 'rep', role: 'sales', email: 'rep@esn.fr' },
  ]

  function build(
    over: {
      teams?: string[]
      members?: Member[]
      counts?: Record<string, number | Error>
      alreadySent?: number
    } = {},
  ) {
    const counts: Record<string, number | Error> = {
      accounts_unassigned: 3,
      interventions: 2,
      done: 14,
      overdue: 5,
      watching: 7,
      ...over.counts,
    }
    const queries: Array<{ sql: string; params: unknown[] }> = []
    const dataSource = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params })
        if (sql.includes('GROUP BY workspace_id')) return (over.teams ?? [WS]).map(workspace_id => ({ workspace_id }))
        if (sql.includes('FROM workspace_members wm')) return over.members ?? MEMBERS
        const key = sql.includes('assigned_to IS NULL')
          ? 'accounts_unassigned'
          : sql.includes('FROM interventions')
            ? 'interventions'
            : sql.includes("execution_status = 'done'")
              ? 'done'
              : sql.includes('i.due_date')
                ? 'overdue'
                : 'watching'
        const value = counts[key]
        if (value instanceof Error) throw value
        return [{ n: value }]
      }),
    }
    const workspaceContext = {
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
    }
    const notifications = { countSince: jest.fn().mockResolvedValue(over.alreadySent ?? 0) }
    const team = { notifyManagerDigest: jest.fn().mockResolvedValue(true) }
    const service = new ManagerDigestService(
      dataSource as never,
      workspaceContext as never,
      notifications as never,
      team as never,
    )
    return { service, dataSource, queries, notifications, team }
  }

  it('dépose UN digest pour chaque manager (team:manage), jamais pour un commercial — via le service d’équipe', async () => {
    const { service, team } = build()

    const result = await service.run(NOW)

    expect(result.delivered).toBe(2)
    const receivers = team.notifyManagerDigest.mock.calls.map(call => call[0].recipientUserId)
    expect(receivers.sort()).toEqual(['mgr', 'ops'])
    expect(receivers).not.toContain('rep')
    expect(team.notifyManagerDigest.mock.calls[0]?.[0]).toMatchObject({
      workspaceId: WS,
      title: 'La semaine de ton équipe',
    })
  })

  it('le digest n’ouvre aucun second chemin : le service ne reçoit NI mailer NI liste de suppression', () => {
    expect(ManagerDigestService.length).toBe(4)
  })

  it('un digest que le service d’équipe n’a pas pu déposer n’est pas compté livré', async () => {
    const { service, team } = build()
    team.notifyManagerDigest.mockResolvedValue(false)
    const result = await service.run(NOW)
    expect(result).toEqual({ delivered: 0, skipped: 2 })
  })

  it('ne cherche que les espaces d’au moins deux membres', async () => {
    const { service, queries } = build()
    await service.run(NOW)
    const teams = queries.find(q => q.sql.includes('GROUP BY workspace_id'))
    expect(teams?.sql).toContain('HAVING count(*) >= $1')
    expect(teams?.params).toEqual([2])
  })

  it('semaine vide (aucune mesure non nulle) ⇒ pas de digest creux', async () => {
    const { service, team } = build({
      counts: { accounts_unassigned: 0, interventions: 0, done: 0, overdue: 0, watching: 0 },
    })
    const result = await service.run(NOW)
    expect(result).toEqual({ delivered: 0, skipped: 0 })
    expect(team.notifyManagerDigest).not.toHaveBeenCalled()
  })

  it('déjà reçu cette semaine ⇒ rien de plus (rejeu du cron)', async () => {
    const { service, team } = build({ alreadySent: 1 })
    const result = await service.run(NOW)
    expect(result.delivered).toBe(0)
    expect(team.notifyManagerDigest).not.toHaveBeenCalled()
  })

  it('chaque mesure est bornée à l’espace actif', async () => {
    const { service, queries } = build()
    await service.run(NOW)
    const measures = queries.filter(q => /count\(\*\)::int AS n/.test(q.sql))
    expect(measures).toHaveLength(5)
    for (const measure of measures) {
      expect(measure.sql).toContain('workspace_id = $1')
      expect(measure.params[0]).toBe(WS)
    }
  })

  it('une mesure ratée n’est PAS « 0 » : sa ligne disparaît, les autres restent', async () => {
    const { service, team } = build({ counts: { done: new Error('pg'), overdue: 5 } })
    await service.run(NOW)
    const body = (team.notifyManagerDigest.mock.calls[0]?.[0].lines as string[]).join('\n')
    expect(body).toContain('5 en retard')
    expect(body).not.toContain('0 action')
    expect(body).not.toContain('faite')
  })

  it('le digest ne nomme aucun commercial et ne contient aucune probabilité', async () => {
    const { service, team } = build()
    await service.run(NOW)
    const body = (team.notifyManagerDigest.mock.calls[0]?.[0].lines as string[]).join('\n')
    for (const email of ['mgr', 'ops', 'rep']) expect(body).not.toContain(email)
    expect(body).not.toMatch(/%|probab/i)
  })
})

describe('digestLines', () => {
  const none: TeamWeekFacts = {
    unassignedAccounts: null,
    openInterventions: null,
    actionsDone: null,
    actionsOverdue: null,
    watchingAccounts: null,
  }

  it('rien de mesuré ou que des zéros ⇒ aucune ligne', () => {
    expect(digestLines(none)).toEqual([])
    expect(
      digestLines({
        unassignedAccounts: 0,
        openInterventions: 0,
        actionsDone: 0,
        actionsOverdue: 0,
        watchingAccounts: 0,
      }),
    ).toEqual([])
  })

  it('accorde le singulier et le pluriel', () => {
    expect(digestLines({ ...none, unassignedAccounts: 1, actionsDone: 1, watchingAccounts: 1 })).toEqual([
      'À arbitrer : 1 compte sans responsable.',
      'Équipe : 1 action faite cette semaine.',
      'En veille : 1 compte.',
    ])
  })
})
