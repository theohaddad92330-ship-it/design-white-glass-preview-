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
import { BRIEFING_ACTION_LABEL_KEYS } from './briefing-actions'

/**
 * #1391 / #1393.2 — UNE TÂCHE EN RETARD S'AFFICHE UNE FOIS, ET ELLE EST CLIQUABLE.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CE QUI SE VOYAIT À L'ÉCRAN
 * ───────────────────────────────────────────────────────────────────────────
 * « Aujourd’hui » montre deux colonnes côte à côte — « À faire maintenant » et
 * « Tes tâches ». La même tâche en retard apparaissait dans les DEUX :
 *
 *  · à gauche, comme carte d'action émise par `buildBriefingActions`, avec
 *    `href: null` — donc rigoureusement AUCUN geste possible dessus ;
 *  · à droite, dans le seau « En retard » de `TaskList`, où elle se coche, se
 *    rouvre et se supprime.
 *
 * Deux fois la même ligne, dont une inerte. Le commentaire du code n'excluait
 * que les tâches dues AUJOURD'HUI (« elles ont leur bloc juste en dessous ») ;
 * les RETARDS, eux, sont dans le même bloc et passaient quand même.
 *
 * ⚠️ On ne fusionne PAS les deux colonnes : `BriefingPage.tsx` porte une
 * décision datée de Louis (01/09/2026) qui les veut côte à côte — « ce que le
 * produit propose » et « ce que l'utilisateur s'est engagé à faire » sont deux
 * moitiés d'une même question. On DÉDOUBLONNE : la tâche sort des cartes
 * d'action et reste là où elle est cliquable.
 *
 * Ce que cette garde prouve :
 *  - elle LIT un corpus non vide (le brief est construit pour de vrai, avec une
 *    tâche en retard qui ARRIVE bien dans le bloc « Tes tâches ») ;
 *  - elle sait dire NON (remettre `overdueTasks` dans `buildBriefingActions`
 *    fait réapparaître une carte `kind: 'task'`, et le test rougit).
 */
describe('#1391 — une tâche en retard ne s’affiche pas deux fois', () => {
  const agenda = { status: jest.fn(), listEvents: jest.fn(), listEventsDetailed: jest.fn() }
  const mailbox = { status: jest.fn(), search: jest.fn() }
  const signalHistory = { listForWorkspace: jest.fn() }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(), isDemoWorkspace: jest.fn() }
  const accounts = { find: jest.fn() }
  const profiles = { findOne: jest.fn() }
  const activities = { count: jest.fn() }
  const contacts = { find: jest.fn() }
  const interventions = { count: jest.fn() }
  const userPreferences = { findOne: jest.fn() }
  const tasks = { openForUser: jest.fn() }

  let service: BriefingService

  /** L'instant du brief. La tâche ci-dessous est due deux jours plus tôt. */
  const NOW = new Date('2026-09-04T07:00:00.000Z')

  const overdue: Task = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Rappeler la DSI avant la commission',
    details: null,
    status: 'todo',
    priority: 'high',
    dueOn: '2026-09-02',
    source: 'manual',
    type: 'personal',
    relatedActionRunId: null,
    sourceLabelKey: null,
    ownerId: null,
    ownerName: null,
    createdById: null,
    createdByName: null,
    expectedResult: null,
    accountId: null,
    accountName: 'ACME',
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
    createdAt: '2026-08-20T08:00:00.000Z',
    updatedAt: '2026-08-20T08:00:00.000Z',
  }

  beforeEach(async () => {
    jest.resetAllMocks()
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws1' })
    workspaceContext.isDemoWorkspace.mockResolvedValue(false)
    signalHistory.listForWorkspace.mockResolvedValue([])
    accounts.find.mockResolvedValue([])
    profiles.findOne.mockResolvedValue({ first_name: 'Théo' })
    userPreferences.findOne.mockResolvedValue(null)
    tasks.openForUser.mockResolvedValue([overdue])
    agenda.status.mockResolvedValue({
      connected: false,
      provider: null,
      capabilities: { read: false, write: false },
    })
    mailbox.status.mockResolvedValue({
      connected: false,
      provider: null,
      address: null,
      capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
    })

    const moduleRef = await Test.createTestingModule({
      providers: [
        BriefingService,
        { provide: AgendaService, useValue: agenda },
        { provide: MailboxService, useValue: mailbox },
        { provide: SignalHistoryService, useValue: signalHistory },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: TasksService, useValue: tasks },
        { provide: getRepositoryToken(AccountEntity), useValue: accounts },
        { provide: getRepositoryToken(ActivityEntity), useValue: activities },
        { provide: getRepositoryToken(ContactEntity), useValue: contacts },
        { provide: getRepositoryToken(InterventionEntity), useValue: interventions },
        { provide: getRepositoryToken(ProfileEntity), useValue: profiles },
        { provide: getRepositoryToken(UserPreferenceEntity), useValue: userPreferences },
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

  it('la tâche en retard EST lue — sans elle, les deux assertions suivantes passeraient sur du vide', async () => {
    const briefing = await service.build('u1', NOW)
    expect(briefing.tasks.state).toBe('ready')
    expect(briefing.tasks.tasks.map(task => task.id)).toEqual([overdue.id])
    expect(briefing.tasks.overdueCount).toBe(1)
  })

  it('elle reste dans « Tes tâches » et ne devient PAS une carte d’action inerte', async () => {
    const briefing = await service.build('u1', NOW)

    // Le nom de la carte fautive est DANS la valeur comparée : sans lui, un
    // échec dirait « 1 n'est pas 0 » et il faudrait le déboguer.
    const taskCards = briefing.actions.filter(action => action.kind === 'task').map(action => action.id)
    expect(taskCards).toEqual([])
  })

  it('aucune carte du brief ne reste sans geste possible', async () => {
    // La cause exacte de #1393.2 : `href: null` sur la seule famille de cartes
    // qui n'avait nulle part où aller. Les autres pointent toutes quelque part.
    const briefing = await service.build('u1', NOW)
    const nowhere = briefing.actions.filter(action => action.href === null).map(action => action.id)
    expect(nowhere).toEqual([])
  })

  it('le serveur n’émet plus le libellé d’une carte « tâche en retard »', () => {
    // La liste des clés émises est la frontière serveur → web (voir
    // `briefing-labels.spec.ts`). Une clé qui y survit sans émetteur ferait
    // garder une traduction que plus personne n'affiche.
    expect([...BRIEFING_ACTION_LABEL_KEYS]).not.toContain('briefing.actions.overdueTask')
  })
})
