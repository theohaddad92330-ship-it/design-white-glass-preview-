import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import request from 'supertest'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { getCorrelationId } from '../../correlation-id/correlation-id.store'
import { AccountEntity } from '../../database/entities/account.entity'
import { RoutineRunEntity } from '../../database/entities/routine-run.entity'
import { RoutineSubscriptionEntity } from '../../database/entities/routine-subscription.entity'
import { AgendaService } from '../agenda/agenda.service'
import { AtsService } from '../ats/ats.service'
import { CrmService } from '../crm/crm.service'
import { MailboxService } from '../mailbox/mailbox.service'
import { NotificationsService } from '../notifications/notifications.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { RoutineBudgetCapEntity } from './routine-budget-cap.entity'
import { RoutineExecutors } from './routine-executors'
import { ROUTINE_BUDGET_STOP_OUTCOME } from './routine-retry'
import { RoutinesBackofficeController } from './routines-backoffice.controller'
import { RoutinesService } from './routines.service'

/**
 * #2843.19 + #2843.21 — BACK-OFFICE SEUL (c132) : le coût de chaque exécution est
 * RATTACHÉ à l'exécution (le fil de corrélation `routine-run:<clé>` que porte chaque
 * ligne `provider_costs` écrite pendant l'exécution), lisible au back-office, et un
 * plafond par routine arrête l'exécution au dépassement, sous un statut NOMMÉ.
 */
describe('#2843.19/.21 — coût rattaché, plafond par routine, back-office seul', () => {
  const USER = '7b3c1f0e-1d2a-4c5b-9e8f-0a1b2c3d4e5f'
  const subscriptions = { find: jest.fn(), findOne: jest.fn(), insert: jest.fn(), save: jest.fn(), create: jest.fn() }
  const runs = { find: jest.fn(), findOne: jest.fn(), query: jest.fn(), insert: jest.fn(), update: jest.fn() }
  const caps = { find: jest.fn(), findOne: jest.fn(), save: jest.fn(), create: jest.fn(), delete: jest.fn() }
  const notifications = { createNotification: jest.fn(), createProactiveBatch: jest.fn() }
  const executors = { run: jest.fn() }
  let service: RoutinesService
  let app: INestApplication

  /** Le SQL du coût est routé par son contenu ; le reste rend vide. */
  function costsAre(rows: { correlation_id: string; cost_usd: string | null }[]) {
    runs.query.mockImplementation((sql: string) => Promise.resolve(sql.includes('provider_costs') ? rows : []))
  }

  beforeEach(async () => {
    jest.resetAllMocks()
    subscriptions.find.mockResolvedValue([])
    subscriptions.findOne.mockResolvedValue(null)
    runs.insert.mockResolvedValue(undefined)
    runs.update.mockResolvedValue(undefined)
    runs.find.mockResolvedValue([])
    costsAre([])
    caps.findOne.mockResolvedValue(null)
    caps.find.mockResolvedValue([])
    caps.create.mockImplementation((value: unknown) => value)
    executors.run.mockResolvedValue({ notified: false, outcome: 'Rien à signaler.' })
    const connected = { connected: true, capabilities: { read: true, draft: true } }
    const moduleRef = await Test.createTestingModule({
      controllers: [RoutinesBackofficeController],
      providers: [
        RoutinesService,
        InternalSecretGuard,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => (key === 'internalApiSecret' ? 'S3CRET' : undefined) },
        },
        { provide: getRepositoryToken(RoutineSubscriptionEntity), useValue: subscriptions },
        { provide: getRepositoryToken(RoutineRunEntity), useValue: runs },
        { provide: getRepositoryToken(AccountEntity), useValue: { count: jest.fn().mockResolvedValue(3) } },
        { provide: getRepositoryToken(RoutineBudgetCapEntity), useValue: caps },
        { provide: NotificationsService, useValue: notifications },
        { provide: RoutineExecutors, useValue: executors },
        { provide: MailboxService, useValue: { status: jest.fn().mockResolvedValue(connected) } },
        { provide: AgendaService, useValue: { status: jest.fn().mockResolvedValue(connected) } },
        { provide: AtsService, useValue: { status: jest.fn().mockResolvedValue({ connected: true }) } },
        { provide: CrmService, useValue: { isConnected: jest.fn().mockResolvedValue(true) } },
        {
          provide: WorkspaceContextService,
          useValue: {
            isDemoWorkspace: jest.fn().mockResolvedValue(false),
            resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w1', role: 'owner' }),
          },
        },
      ],
    }).compile()
    service = moduleRef.get(RoutinesService)
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  it('l’exécution tourne sous le fil `routine-run:<clé>` — chaque coût écrit pendant elle s’y rattache', async () => {
    let seen: string | undefined
    executors.run.mockImplementation(async () => {
      seen = getCorrelationId()
      return { notified: false, outcome: 'ok' }
    })
    await service.runNow(USER, 'no_reply_follow_up', new Date('2026-11-02T10:00:00Z'))
    expect(seen).toBe(`routine-run:${USER}:no_reply_follow_up:manual:2026-11-02T10:00`)
  })

  it('plafond dépassé : l’exécution N’A PAS LIEU, la trace porte le statut nommé, personne n’est notifié', async () => {
    caps.findOne.mockResolvedValue({ user_id: USER, routine_key: 'no_reply_follow_up', cost_cap_usd: '0.50' })
    costsAre([{ correlation_id: `routine-run:${USER}:no_reply_follow_up:2026-11-01`, cost_usd: '0.60' }])
    const result = await service.runNow(USER, 'no_reply_follow_up', new Date('2026-11-02T10:00:00Z'))
    expect(executors.run).not.toHaveBeenCalled()
    expect(result.outcome).toBe(ROUTINE_BUDGET_STOP_OUTCOME)
    expect(runs.update).toHaveBeenCalledWith(
      { run_key: `${USER}:no_reply_follow_up:manual:2026-11-02T10:00` },
      expect.objectContaining({ notified: false, outcome: ROUTINE_BUDGET_STOP_OUTCOME }),
    )
    // Le statut se NOMME sans chiffre (c132) : ni montant, ni crédit dans ce que lit l'utilisateur.
    expect(ROUTINE_BUDGET_STOP_OUTCOME).not.toMatch(/\d|€|\$|crédit/i)
  })

  it('sous le plafond, elle s’exécute normalement', async () => {
    caps.findOne.mockResolvedValue({ user_id: USER, routine_key: 'no_reply_follow_up', cost_cap_usd: '0.50' })
    costsAre([{ correlation_id: `routine-run:${USER}:no_reply_follow_up:2026-11-01`, cost_usd: '0.10' }])
    await service.runNow(USER, 'no_reply_follow_up', new Date('2026-11-02T10:00:00Z'))
    expect(executors.run).toHaveBeenCalled()
  })

  it('le back-office lit le coût par exécution, le plafond et les arrêts — `null` quand rien n’est mesuré', async () => {
    runs.find.mockResolvedValue([
      {
        routine_key: 'no_reply_follow_up',
        run_key: `${USER}:no_reply_follow_up:2026-11-01`,
        outcome: 'ok',
        attempt: 1,
        duration_ms: 10,
      },
      {
        routine_key: 'no_reply_follow_up',
        run_key: `${USER}:no_reply_follow_up:2026-11-02`,
        outcome: ROUTINE_BUDGET_STOP_OUTCOME,
        attempt: 1,
        duration_ms: 0,
      },
      {
        routine_key: 'daily_briefing',
        run_key: `${USER}:daily_briefing:2026-11-02`,
        outcome: 'ok',
        attempt: 1,
        duration_ms: 5,
      },
    ])
    costsAre([
      { correlation_id: `routine-run:${USER}:no_reply_follow_up:2026-11-01`, cost_usd: '0.25' },
      { correlation_id: `routine-run:${USER}:no_reply_follow_up:2026-11-01`, cost_usd: null },
    ])
    caps.find.mockResolvedValue([{ user_id: USER, routine_key: 'no_reply_follow_up', cost_cap_usd: '0.50' }])
    const result = await service.backofficeRuns(USER, new Date('2026-11-02T12:00:00Z'))
    const reply = result.routines.find(entry => entry.key === 'no_reply_follow_up')
    const briefing = result.routines.find(entry => entry.key === 'daily_briefing')
    expect(reply).toMatchObject({ costUsd: 0.25, capUsd: 0.5, stoppedByCap: 1 })
    expect(reply?.costByRun).toEqual([{ runKey: `${USER}:no_reply_follow_up:2026-11-01`, costUsd: 0.25 }])
    expect(briefing).toMatchObject({ costUsd: null, capUsd: null, stoppedByCap: 0 })
  })

  it('un utilisateur d’espace est REFUSÉ (403) sur la lecture comme sur le réglage du plafond', async () => {
    const server = app.getHttpServer()
    await request(server)
      .get('/internal/admin/routines/runs')
      .query({ userId: USER })
      .set('Authorization', 'Bearer jeton-utilisateur')
      .expect(403)
    await request(server)
      .put('/internal/admin/routines/caps')
      .set('Authorization', 'Bearer jeton-utilisateur')
      .send({ userId: USER, routineKey: 'no_reply_follow_up', capUsd: 1 })
      .expect(403)
    expect(caps.save).not.toHaveBeenCalled()
  })

  it('le back-office règle le plafond (et l’efface avec null)', async () => {
    const server = app.getHttpServer()
    await request(server)
      .put('/internal/admin/routines/caps')
      .set('x-internal-secret', 'S3CRET')
      .send({ userId: USER, routineKey: 'no_reply_follow_up', capUsd: 1.5 })
      .expect(200)
    expect(caps.save).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER, routine_key: 'no_reply_follow_up', cost_cap_usd: '1.5' }),
    )
    await request(server)
      .put('/internal/admin/routines/caps')
      .set('x-internal-secret', 'S3CRET')
      .send({ userId: USER, routineKey: 'no_reply_follow_up', capUsd: null })
      .expect(200)
    expect(caps.delete).toHaveBeenCalledWith({ user_id: USER, routine_key: 'no_reply_follow_up' })
    await request(server)
      .put('/internal/admin/routines/caps')
      .set('x-internal-secret', 'S3CRET')
      .send({ userId: USER, routineKey: 'inconnue', capUsd: 1 })
      .expect(400)
  })
})
