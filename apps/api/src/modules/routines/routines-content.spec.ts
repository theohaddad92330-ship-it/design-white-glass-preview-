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
import { RoutineContentEntity } from './routine-content.entity'
import { RoutineExecutors } from './routine-executors'
import { RoutinesService } from './routines.service'

/**
 * #2843.30 — le CONTENU exact d'une routine se règle PAR ESPACE, revient au défaut, et
 * le moteur l'APPLIQUE au texte de la notification (un réglage que rien ne lit serait mort).
 */
describe('#2843.30 — contenu d’une routine, par espace', () => {
  const subscriptions = { find: jest.fn(), findOne: jest.fn(), insert: jest.fn(), save: jest.fn(), create: jest.fn() }
  const runs = { find: jest.fn(), findOne: jest.fn(), query: jest.fn(), insert: jest.fn(), update: jest.fn() }
  const contents = { findOne: jest.fn(), save: jest.fn(), create: jest.fn(), delete: jest.fn() }
  const notifications = { createNotification: jest.fn(), createProactiveBatch: jest.fn() }
  const executors = { run: jest.fn() }
  const workspaceContext = { isDemoWorkspace: jest.fn(), resolveActiveWorkspace: jest.fn() }
  let service: RoutinesService

  beforeEach(async () => {
    jest.resetAllMocks()
    subscriptions.findOne.mockResolvedValue(null)
    runs.query.mockResolvedValue([])
    runs.insert.mockResolvedValue(undefined)
    runs.update.mockResolvedValue(undefined)
    contents.findOne.mockResolvedValue(null)
    contents.create.mockImplementation((value: unknown) => value)
    workspaceContext.isDemoWorkspace.mockResolvedValue(false)
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w1', role: 'sales' })
    executors.run.mockResolvedValue({
      notified: true,
      outcome: '2 relances.',
      notification: { title: 'Relances', body: '2 fils sans réponse', link: '/mailbox' },
    })
    const connected = { connected: true, capabilities: { read: true, draft: true } }
    const moduleRef = await Test.createTestingModule({
      providers: [
        RoutinesService,
        { provide: getRepositoryToken(RoutineSubscriptionEntity), useValue: subscriptions },
        { provide: getRepositoryToken(RoutineRunEntity), useValue: runs },
        { provide: getRepositoryToken(AccountEntity), useValue: { count: jest.fn().mockResolvedValue(3) } },
        { provide: getRepositoryToken(RoutineContentEntity), useValue: contents },
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

  it('sans gabarit, la vue le dit (`null`) — le défaut n’est jamais recopié', async () => {
    expect(await service.content('u1', 'no_reply_follow_up')).toEqual({ key: 'no_reply_follow_up', template: null })
  })

  it('enregistre le gabarit POUR L’ESPACE de l’utilisateur', async () => {
    await service.setContent('u1', 'no_reply_follow_up', { template: 'Cette semaine : {{resultat}}' })
    expect(contents.save).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'w1',
        routine_key: 'no_reply_follow_up',
        template: 'Cette semaine : {{resultat}}',
        updated_by: 'u1',
      }),
    )
  })

  it('revenir au défaut efface la ligne de l’espace', async () => {
    await service.resetContent('u1', 'no_reply_follow_up')
    expect(contents.delete).toHaveBeenCalledWith({ workspace_id: 'w1', routine_key: 'no_reply_follow_up' })
  })

  it('refuse une routine inconnue et un utilisateur sans espace', async () => {
    await expect(service.setContent('u1', 'inconnue', { template: 'x' })).rejects.toThrow(BadRequestException)
    workspaceContext.resolveActiveWorkspace.mockRejectedValue(new Error('aucun espace'))
    await expect(service.setContent('u1', 'no_reply_follow_up', { template: 'x' })).rejects.toThrow(BadRequestException)
  })

  it('le moteur applique le gabarit de l’espace au texte de la notification', async () => {
    contents.findOne.mockResolvedValue({
      workspace_id: 'w1',
      routine_key: 'no_reply_follow_up',
      template: 'Cette semaine : {{resultat}}',
    })
    await service.runNow('u1', 'no_reply_follow_up', new Date('2026-11-02T10:00:00Z'))
    expect(notifications.createProactiveBatch).toHaveBeenCalledWith('u1', [
      expect.objectContaining({ title: 'Relances', body: 'Cette semaine : 2 fils sans réponse' }),
    ])
  })
})
