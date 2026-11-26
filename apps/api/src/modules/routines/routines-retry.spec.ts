import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { RoutineRunEntity } from '../../database/entities/routine-run.entity'
import { RoutineSubscriptionEntity } from '../../database/entities/routine-subscription.entity'
import { AgendaService } from '../agenda/agenda.service'
import { AtsService } from '../ats/ats.service'
import { CrmService } from '../crm/crm.service'
import { MailboxService } from '../mailbox/mailbox.service'
import { NotificationsService } from '../notifications/notifications.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { RoutineExecutors } from './routine-executors'
import { routineRetryDue } from './routine-retry'
import { RoutinesService } from './routines.service'
import { RoutinesBackofficeController } from './routines-backoffice.controller'
import { InternalSecretGuard } from '../../common/internal-secret.guard'

/**
 * #2843.20 (reprise retry/backoff) · #2843.9 (statut `error` PRODUIT) ·
 * #2843.21/.24 (durée par exécution, back-office seul) · #2843.10 (lancer
 * maintenant) — lot L13.
 */
describe('routineRetryDue — la reprise et sa limite', () => {
  const at = (iso: string) => new Date(iso)
  const failed = { outcome: 'Échec : Graph 503', created_at: at('2026-11-02T08:00:00Z') }

  it('une occurrence réussie ne se rejoue jamais', () => {
    expect(routineRetryDue({ ...failed, outcome: '2 actions.' }, at('2026-11-02T12:00:00Z'))).toBe(false)
  })

  it('backoff : pas avant 15 min après la 1re tentative, puis 30 min après la 2e', () => {
    expect(routineRetryDue({ ...failed, attempt: 1 }, at('2026-11-02T08:10:00Z'))).toBe(false)
    expect(routineRetryDue({ ...failed, attempt: 1 }, at('2026-11-02T08:15:00Z'))).toBe(true)
    const second = { ...failed, attempt: 2, attempted_at: at('2026-11-02T08:15:00Z') }
    expect(routineRetryDue(second, at('2026-11-02T08:30:00Z'))).toBe(false)
    expect(routineRetryDue(second, at('2026-11-02T08:45:00Z'))).toBe(true)
  })

  it('trois tentatives : on ne rejoue plus', () => {
    expect(routineRetryDue({ ...failed, attempt: 3 }, at('2026-11-03T08:00:00Z'))).toBe(false)
  })
})

describe('RoutinesService — reprise, statut error, durée, lancer maintenant', () => {
  const subscriptions = {
    find: jest.fn(),
    findOne: jest.fn(),
    insert: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  }
  const runs = { find: jest.fn(), findOne: jest.fn(), query: jest.fn(), insert: jest.fn(), update: jest.fn() }
  const notifications = { createNotification: jest.fn(), createProactiveBatch: jest.fn() }
  const executors = { run: jest.fn() }
  const workspaceContext = { isDemoWorkspace: jest.fn(), resolveActiveWorkspace: jest.fn() }
  let service: RoutinesService

  const SUB = {
    routine_key: 'daily_briefing',
    status: 'active',
    enabled: true,
    hour: 8,
    weekday: null,
    channel: 'in_app',
    time_zone: 'Europe/Paris',
  }
  const NOW = new Date('2026-11-02T08:20:00Z') // 9 h 20 à Paris
  const RUN_KEY = 'u1:daily_briefing:2026-11-02'

  beforeEach(async () => {
    jest.resetAllMocks()
    subscriptions.find.mockResolvedValue([SUB])
    subscriptions.update.mockResolvedValue({ affected: 1 })
    runs.findOne.mockResolvedValue(null)
    runs.find.mockResolvedValue([])
    runs.query.mockResolvedValue([])
    runs.insert.mockResolvedValue(undefined)
    runs.update.mockResolvedValue({ affected: 1 })
    workspaceContext.isDemoWorkspace.mockResolvedValue(false)
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w1', role: 'owner' })
    executors.run.mockResolvedValue({ notified: false, outcome: 'Rien à signaler.' })
    const connected = { connected: true, capabilities: { read: true, draft: true, write: true } }

    const moduleRef = await Test.createTestingModule({
      providers: [
        RoutinesService,
        { provide: getRepositoryToken(RoutineSubscriptionEntity), useValue: subscriptions },
        { provide: getRepositoryToken(RoutineRunEntity), useValue: runs },
        { provide: getRepositoryToken(AccountEntity), useValue: { count: jest.fn().mockResolvedValue(3) } },
        { provide: NotificationsService, useValue: notifications },
        { provide: RoutineExecutors, useValue: executors },
        { provide: MailboxService, useValue: { status: jest.fn().mockResolvedValue(connected) } },
        { provide: AgendaService, useValue: { status: jest.fn().mockResolvedValue(connected) } },
        { provide: AtsService, useValue: { status: jest.fn().mockResolvedValue({ connected: true }) } },
        { provide: CrmService, useValue: { isConnected: jest.fn().mockResolvedValue(true) } },
        { provide: WorkspaceContextService, useValue: workspaceContext },
      ],
    }).compile()
    service = moduleRef.get(RoutinesService)
  })

  const onlyBriefing = () => executors.run.mock.calls.filter(([key]) => key === 'daily_briefing').length

  it('rejoue l’occurrence échouée du jour après le délai, sur la MÊME ligne (jamais une seconde)', async () => {
    runs.findOne.mockImplementation(({ where }) =>
      where.routine_key === 'daily_briefing'
        ? {
            run_key: RUN_KEY,
            outcome: 'Échec : Graph 503',
            attempt: 1,
            attempted_at: new Date('2026-11-02T08:00:00Z'),
            created_at: new Date('2026-11-02T08:00:00Z'),
          }
        : null,
    )

    await service.runDueFor('u1', NOW)

    expect(onlyBriefing()).toBe(1)
    expect(runs.insert).not.toHaveBeenCalledWith(expect.objectContaining({ run_key: RUN_KEY }))
    // La reprise se RÉSERVE par une écriture conditionnelle : une autre instance qui a déjà repris perd.
    expect(runs.update).toHaveBeenCalledWith(
      expect.objectContaining({ run_key: RUN_KEY, attempt: 1 }),
      expect.objectContaining({ attempt: 2, outcome: 'En cours…' }),
    )
  })

  it('une autre instance a déjà repris : rien ne s’exécute', async () => {
    runs.findOne.mockImplementation(({ where }) =>
      where.routine_key === 'daily_briefing'
        ? { run_key: RUN_KEY, outcome: 'Échec : x', attempt: 1, created_at: new Date('2026-11-02T08:00:00Z') }
        : null,
    )
    runs.update.mockResolvedValueOnce({ affected: 0 })
    await service.runDueFor('u1', NOW)
    expect(onlyBriefing()).toBe(0)
  })

  it('troisième échec : l’abonnement passe en statut `error`, désactivé, et l’utilisateur le lit', async () => {
    runs.findOne.mockImplementation(({ where }) =>
      where.routine_key === 'daily_briefing'
        ? {
            run_key: RUN_KEY,
            outcome: 'Échec : Graph 503',
            attempt: 2,
            attempted_at: new Date('2026-11-02T07:45:00Z'),
            created_at: new Date('2026-11-02T07:30:00Z'),
          }
        : null,
    )
    executors.run.mockImplementation(async key => {
      if (key === 'daily_briefing') throw new Error('Graph 503')
      return { notified: false, outcome: 'Rien.' }
    })

    await service.runDueFor('u1', NOW)

    expect(subscriptions.update).toHaveBeenCalledWith(
      { user_id: 'u1', routine_key: 'daily_briefing' },
      { status: 'error', enabled: false },
    )
    const [, batch] = notifications.createProactiveBatch.mock.calls[0]
    expect(batch).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: expect.stringContaining('Brief du matin') })]),
    )
  })

  it('un premier échec ne désactive rien : la reprise suit', async () => {
    executors.run.mockImplementation(async key => {
      if (key === 'daily_briefing') throw new Error('Graph 503')
      return { notified: false, outcome: 'Rien.' }
    })
    await service.runDueFor('u1', NOW)
    expect(subscriptions.update).not.toHaveBeenCalled()
  })

  it('une routine en statut `error` ne tourne plus d’elle-même', async () => {
    subscriptions.find.mockResolvedValue([{ ...SUB, status: 'error', enabled: false }])
    await service.runDueFor('u1', NOW)
    expect(onlyBriefing()).toBe(0)
  })

  it('#2843.24 — la durée d’exécution est écrite dans la trace', async () => {
    await service.runDueFor('u1', NOW)
    expect(runs.update).toHaveBeenCalledWith(
      { run_key: RUN_KEY },
      expect.objectContaining({ duration_ms: expect.any(Number) }),
    )
  })

  it('#2843.19/.21/.24 — l’historique CLIENT ne renvoie ni durée, ni tentative, ni coût (back-office seul)', async () => {
    runs.find.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000001',
        created_at: new Date('2026-11-02T08:00:00Z'),
        notified: true,
        outcome: '2 actions.',
        proof_ref: null,
        attempt: 2,
        duration_ms: 1234,
      },
    ])
    const [row] = await service.listRuns('u1', 'daily_briefing')
    expect(Object.keys(row).sort()).toEqual(['createdAt', 'failed', 'id', 'notified', 'outcome', 'proofRef'])
  })

  it('#2843.10 — lancer maintenant : exécute CETTE routine hors horaire, une fois par minute', async () => {
    const outcome = await service.runNow('u1', 'daily_briefing', NOW)
    expect(executors.run).toHaveBeenCalledTimes(1)
    expect(executors.run.mock.calls[0][0]).toBe('daily_briefing')
    expect(runs.insert).toHaveBeenCalledWith(
      expect.objectContaining({ run_key: 'u1:daily_briefing:manual:2026-11-02T08:20' }),
    )
    expect(outcome).toEqual({ executed: true, outcome: 'Rien à signaler.' })
  })

  it('#2843.10 — lancer maintenant : deux clics dans la minute n’exécutent qu’une fois', async () => {
    runs.insert.mockRejectedValue(new Error('duplicate key'))
    const outcome = await service.runNow('u1', 'daily_briefing', NOW)
    expect(executors.run).not.toHaveBeenCalled()
    expect(outcome.executed).toBe(false)
  })

  it('#2843.10 — lancer maintenant ne joue rien en salle de démonstration', async () => {
    workspaceContext.isDemoWorkspace.mockResolvedValue(true)
    const outcome = await service.runNow('u1', 'daily_briefing', NOW)
    expect(executors.run).not.toHaveBeenCalled()
    expect(outcome).toEqual({ executed: false, outcome: null, reason: 'demo' })
  })
})

describe('#2843.21/.24 — la lecture back-office', () => {
  it('par routine : tentatives, échecs, médiane des durées MESURÉES (null si aucune, jamais 0)', async () => {
    const runs = {
      find: jest.fn().mockResolvedValue([
        { routine_key: 'daily_briefing', outcome: '2 actions.', attempt: 2, duration_ms: 300 },
        { routine_key: 'daily_briefing', outcome: 'Échec : 503', attempt: 1, duration_ms: 100 },
        { routine_key: 'daily_briefing', outcome: 'Rien.', attempt: 1, duration_ms: 200 },
        { routine_key: 'weekly_recap', outcome: 'Rien.', attempt: 1, duration_ms: null },
      ]),
    }
    const service = new RoutinesService(
      {} as never,
      runs as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
    const result = await service.backofficeRuns('u1', new Date('2026-11-02T08:00:00Z'))
    expect(runs.find.mock.calls[0][0].where.user_id).toBe('u1')
    expect(result.routines).toEqual([
      {
        key: 'daily_briefing',
        runs: 3,
        failures: 1,
        retries: 1,
        medianDurationMs: 200,
        maxDurationMs: 300,
        costUsd: null,
        costByRun: [],
        capUsd: null,
        stoppedByCap: 0,
      },
      {
        key: 'weekly_recap',
        runs: 1,
        failures: 0,
        retries: 0,
        medianDurationMs: null,
        maxDurationMs: null,
        costUsd: null,
        costByRun: [],
        capUsd: null,
        stoppedByCap: 0,
      },
    ])
  })

  it('le contrôleur back-office est tenu par le secret interne, jamais par un JWT utilisateur', () => {
    const guards = Reflect.getMetadata('__guards__', RoutinesBackofficeController) as unknown[]
    expect(guards).toContain(InternalSecretGuard)
    expect(Reflect.getMetadata('path', RoutinesBackofficeController)).toMatch(/^internal\/admin\//)
  })
})

describe('#2843.18 — trente jours d’exécutions réelles, côté client', () => {
  it('compte exécutions, prises de parole et échecs — et rien d’autre', async () => {
    const runs = {
      find: jest.fn().mockResolvedValue([
        { notified: true, outcome: '2 actions.' },
        { notified: false, outcome: 'Échec : 503' },
        { notified: false, outcome: 'Rien.' },
      ]),
    }
    const service = new RoutinesService(
      {} as never,
      runs as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
    const result = await service.observation('u1', 'daily_briefing', new Date('2026-11-02T08:00:00Z'))
    expect(result).toEqual({ days: 30, runs: 3, notified: 1, failed: 1 })
    expect(runs.find.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ user_id: 'u1', routine_key: 'daily_briefing' }),
    )
  })

  it('refuse une routine inconnue', async () => {
    const service = new RoutinesService(
      {} as never,
      { find: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
    await expect(service.observation('u1', 'nope')).rejects.toThrow('Routine inconnue')
  })
})
