import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import type { Task } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { AttackAngleEntity } from '../../database/entities/attack-angle.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { InterventionEntity } from '../../database/entities/intervention.entity'
import { AgendaBellumCreatedEventEntity } from '../../database/entities/agenda-bellum-created-event.entity'
import { FocusPlanBlockOutcomeEntity } from '../../database/entities/focus-plan-block-outcome.entity'
import { NoteEntity } from '../../database/entities/note.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { RoutineRunEntity } from '../../database/entities/routine-run.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { UserPreferenceEntity } from '../../database/entities/user-preference.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { AgendaService } from '../agenda/agenda.service'
import { MailboxService } from '../mailbox/mailbox.service'
import { SignalHistoryService } from '../signal-history/signal-history.service'
import { TasksService } from '../tasks/tasks.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { BriefingService } from './briefing.service'

/**
 * #2392 — la clôture de fin de journée se COMPILE sur les tâches réelles.
 *
 * Ce que ces tests défendent : une tâche cochée aujourd'hui (et lue par la
 * seconde lecture, celle des tâches CLOSES) arrive dans les résultats ; une
 * panne de lecture se DIT au lieu de rendre une clôture vide ; une messagerie
 * non connectée se dit aussi.
 */
describe('BriefingService.dayClosure (#2392)', () => {
  const mailbox = { status: jest.fn(), search: jest.fn() }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(), isDemoWorkspace: jest.fn() }
  const tasksService = { openForUser: jest.fn(), closedOrCreatedSince: jest.fn() }
  const profiles = { findOne: jest.fn() }
  const accounts = { find: jest.fn(), manager: { query: jest.fn() } }
  let service: BriefingService

  const now = new Date('2026-09-23T17:30:00Z')

  function task(overrides: Partial<Task>): Task {
    return {
      id: 'x',
      title: 't',
      details: null,
      status: 'todo',
      priority: 'normal',
      dueOn: '2026-09-23',
      source: 'manual',
      type: 'personal',
      relatedActionRunId: null,
      sourceLabelKey: null,
      ownerId: 'u1',
      ownerName: null,
      createdById: 'u1',
      createdByName: null,
      expectedResult: null,
      accountId: null,
      accountName: null,
      contactId: null,
      contactName: null,
      projectId: null,
      projectLabel: null,
      completedAt: null,
      completedById: null,
      completedByName: null,
      resultNote: null,
      channel: null,
      objective: null,
      createdAt: '2026-09-01T08:00:00Z',
      updatedAt: '2026-09-01T08:00:00Z',
      ...overrides,
    }
  }

  beforeEach(async () => {
    jest.resetAllMocks()
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws1', role: null })
    workspaceContext.isDemoWorkspace.mockResolvedValue(false)
    mailbox.status.mockResolvedValue({ connected: false, capabilities: {} })
    const moduleRef = await Test.createTestingModule({
      providers: [
        BriefingService,
        { provide: AgendaService, useValue: {} },
        { provide: MailboxService, useValue: mailbox },
        { provide: SignalHistoryService, useValue: {} },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: TasksService, useValue: tasksService },
        { provide: getRepositoryToken(AccountEntity), useValue: accounts },
        { provide: getRepositoryToken(ActivityEntity), useValue: {} },
        { provide: getRepositoryToken(ContactEntity), useValue: {} },
        { provide: getRepositoryToken(InterventionEntity), useValue: {} },
        { provide: getRepositoryToken(ProfileEntity), useValue: profiles },
        { provide: getRepositoryToken(UserPreferenceEntity), useValue: {} },
        { provide: getRepositoryToken(AttackAngleEntity), useValue: {} },
        { provide: getRepositoryToken(RoutineRunEntity), useValue: {} },
        { provide: getRepositoryToken(ActionPlanItemEntity), useValue: {} },
        { provide: getRepositoryToken(UserActionEntity), useValue: {} },
        { provide: getRepositoryToken(WorkflowRunEntity), useValue: {} },
        { provide: getRepositoryToken(NoteEntity), useValue: {} },
        { provide: getRepositoryToken(AgendaBellumCreatedEventEntity), useValue: {} },
        { provide: getRepositoryToken(FocusPlanBlockOutcomeEntity), useValue: {} },
      ],
    }).compile()
    service = moduleRef.get(BriefingService)
  })

  it("compile les tâches OUVERTES et celles CLOSES aujourd'hui, dans le fuseau de la personne", async () => {
    tasksService.openForUser.mockResolvedValue([task({ id: 'late', dueOn: '2026-09-20' })])
    tasksService.closedOrCreatedSince.mockResolvedValue([
      task({ id: 'done', status: 'done', completedAt: '2026-09-23T09:00:00Z', resultNote: 'Appel passé' }),
      // 23h30 à Paris le 22 = hier, même si c'est le 22 à 21h30 UTC : hors résultats.
      task({ id: 'yesterday', status: 'done', completedAt: '2026-09-22T21:30:00Z' }),
    ])

    const closure = await service.dayClosure('u1', now, 'Europe/Paris')

    expect(closure.date).toBe('2026-09-23')
    expect(closure.tasksState).toBe('ready')
    expect(closure.results.map(t => t.id)).toEqual(['done'])
    expect(closure.toDecide.map(t => t.id)).toEqual(['late'])
    expect(tasksService.closedOrCreatedSince).toHaveBeenCalledWith('u1', 'ws1', expect.any(Date))
  })

  it('une panne des tâches se DIT : état `unavailable`, jamais une clôture vide qui se croirait finie', async () => {
    tasksService.openForUser.mockRejectedValue(new Error('db down'))
    tasksService.closedOrCreatedSince.mockResolvedValue([])

    const closure = await service.dayClosure('u1', now, 'Europe/Paris')

    expect(closure.tasksState).toBe('unavailable')
    expect(closure.tasksReason).toBeTruthy()
    expect(closure.toDecide).toEqual([])
  })

  it('messagerie non connectée : les attentes externes le disent', async () => {
    tasksService.openForUser.mockResolvedValue([])
    tasksService.closedOrCreatedSince.mockResolvedValue([])

    const closure = await service.dayClosure('u1', now, 'Europe/Paris')

    expect(closure.waitingOn.state).toBe('not_connected')
    expect(closure.waitingOn.threads).toEqual([])
  })
})
