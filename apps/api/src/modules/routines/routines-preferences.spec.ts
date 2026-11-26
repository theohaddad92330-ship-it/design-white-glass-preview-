import { BadRequestException } from '@nestjs/common'
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
import { RoutinePreferenceEntity } from './routine-preference.entity'
import { RoutinesService } from './routines.service'

/**
 * #2843.13 — l'AUTONOMIE et l'OWNER réglés par l'utilisateur sont LUS par le moteur :
 * un réglage que rien ne lit serait un réglage mort.
 * - autonomie : seulement le niveau du catalogue ou `n0_inform` (jamais au-dessus) ;
 *   `n0_inform` = la routine tourne, garde sa trace, ne notifie pas.
 * - owner : seulement pour une routine de portée `workspace`, et seulement un membre
 *   du même espace ; c'est lui qui reçoit le résultat dans l'application.
 */
describe('#2843.13 — autonomie et owner réglables, et lus', () => {
  const OWNER = '7b3c1f0e-1d2a-4c5b-9e8f-0a1b2c3d4e5f'
  const subscriptions = { find: jest.fn(), findOne: jest.fn(), insert: jest.fn(), save: jest.fn(), create: jest.fn() }
  const runs = { find: jest.fn(), findOne: jest.fn(), query: jest.fn(), insert: jest.fn(), update: jest.fn() }
  const preferences = { find: jest.fn(), findOne: jest.fn(), save: jest.fn(), create: jest.fn() }
  const notifications = { createNotification: jest.fn(), createProactiveBatch: jest.fn() }
  const executors = { run: jest.fn() }
  const workspaceContext = {
    isDemoWorkspace: jest.fn(),
    resolveActiveWorkspace: jest.fn(),
    getMembership: jest.fn(),
  }
  let service: RoutinesService

  beforeEach(async () => {
    jest.resetAllMocks()
    subscriptions.find.mockResolvedValue([])
    subscriptions.findOne.mockResolvedValue(null)
    subscriptions.create.mockImplementation((value: unknown) => value)
    runs.query.mockResolvedValue([])
    runs.insert.mockResolvedValue(undefined)
    runs.update.mockResolvedValue(undefined)
    preferences.find.mockResolvedValue([])
    preferences.findOne.mockResolvedValue(null)
    preferences.create.mockImplementation((value: unknown) => value)
    workspaceContext.isDemoWorkspace.mockResolvedValue(false)
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w1', role: 'owner' })
    workspaceContext.getMembership.mockResolvedValue(null)
    executors.run.mockResolvedValue({
      notified: true,
      outcome: '1 alerte.',
      notification: { title: 'Marge', body: 'Une mission sous le seuil', link: '/pilotage' },
    })
    const connected = { connected: true, capabilities: { read: true, draft: true } }
    const moduleRef = await Test.createTestingModule({
      providers: [
        RoutinesService,
        { provide: getRepositoryToken(RoutineSubscriptionEntity), useValue: subscriptions },
        { provide: getRepositoryToken(RoutineRunEntity), useValue: runs },
        { provide: getRepositoryToken(AccountEntity), useValue: { count: jest.fn().mockResolvedValue(3) } },
        { provide: getRepositoryToken(RoutinePreferenceEntity), useValue: preferences },
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

  it('enregistre une autonomie abaissée à n0 et la rend dans la vue', async () => {
    await service.update('u1', 'meeting_prep', { autonomy: 'n0_inform' })
    expect(preferences.save).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', routine_key: 'meeting_prep', autonomy: 'n0_inform' }),
    )
    preferences.find.mockResolvedValue([{ user_id: 'u1', routine_key: 'meeting_prep', autonomy: 'n0_inform' }])
    const views = await service.list('u1')
    expect(views.find(view => view.definition.key === 'meeting_prep')?.subscription.autonomy).toBe('n0_inform')
  })

  it('refuse une autonomie au-dessus du catalogue, ou intermédiaire sans effet', async () => {
    await expect(service.update('u1', 'meeting_prep', { autonomy: 'n5_extended_auto' })).rejects.toThrow(
      BadRequestException,
    )
    await expect(service.update('u1', 'meeting_prep', { autonomy: 'n1_prepare' })).rejects.toThrow(BadRequestException)
    expect(preferences.save).not.toHaveBeenCalled()
  })

  it('refuse un owner sur une routine qui lit la boîte ou l’agenda de la personne (portée personnelle)', async () => {
    await expect(service.update('u1', 'no_reply_follow_up', { ownerUserId: OWNER })).rejects.toThrow(
      BadRequestException,
    )
  })

  it('refuse un owner qui n’est pas membre de l’espace', async () => {
    await expect(service.update('u1', 'margin_alert', { ownerUserId: OWNER })).rejects.toThrow(BadRequestException)
    expect(workspaceContext.getMembership).toHaveBeenCalledWith(OWNER, 'w1')
  })

  it('accepte un owner membre sur une routine de l’espace', async () => {
    workspaceContext.getMembership.mockResolvedValue({ user_id: OWNER, workspace_id: 'w1' })
    await service.update('u1', 'margin_alert', { ownerUserId: OWNER })
    expect(preferences.save).toHaveBeenCalledWith(expect.objectContaining({ owner_user_id: OWNER }))
  })

  it('n0_inform : la routine tourne et garde sa trace, mais ne notifie personne', async () => {
    preferences.findOne.mockResolvedValue({ user_id: 'u1', routine_key: 'margin_alert', autonomy: 'n0_inform' })
    const result = await service.runNow('u1', 'margin_alert', new Date('2026-11-02T10:00:00Z'))
    expect(result.executed).toBe(true)
    expect(executors.run).toHaveBeenCalled()
    expect(notifications.createProactiveBatch).toHaveBeenCalledWith('u1', [])
  })

  it('owner réglé : c’est l’owner qui reçoit le résultat, pas l’abonné', async () => {
    preferences.findOne.mockResolvedValue({ user_id: 'u1', routine_key: 'margin_alert', owner_user_id: OWNER })
    await service.runNow('u1', 'margin_alert', new Date('2026-11-02T10:00:00Z'))
    expect(notifications.createProactiveBatch).toHaveBeenCalledWith(OWNER, [
      expect.objectContaining({ title: 'Marge' }),
    ])
    expect(notifications.createProactiveBatch).not.toHaveBeenCalledWith('u1', [expect.anything()])
  })
})
