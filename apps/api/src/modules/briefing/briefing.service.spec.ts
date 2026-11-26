// #3414 — observe le rôle passé à l'ordonnancement SANS le remplacer (un simple
// tableau : `resetMocks` ne vide pas une implémentation enveloppée dans jest.fn).
const mockRoleOrderCalls: unknown[] = []
// #3386 — le rôle MÉTIER (3e argument) reçu à chaque appel.
const mockRoleCalls: unknown[][] = []
jest.mock('./briefing-role-order', () => {
  const actual = jest.requireActual<typeof import('./briefing-role-order')>('./briefing-role-order')
  return {
    ...actual,
    orderActionsForRole: (actions: never[], role: unknown, businessRole?: string | null) => {
      mockRoleOrderCalls.push(role)
      mockRoleCalls.push([actions, role, businessRole])
      return actual.orderActionsForRole(actions, role as never, businessRole)
    },
  }
})
import { overdueDaysFromDueOn } from '@bellum/contracts'
import { DEMO_OWNER } from '../demo/demo-dataset'
import type { HttpException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { FindOperator } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { AgendaBellumCreatedEventEntity } from '../../database/entities/agenda-bellum-created-event.entity'
import { AttackAngleEntity } from '../../database/entities/attack-angle.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { FocusPlanBlockOutcomeEntity } from '../../database/entities/focus-plan-block-outcome.entity'
import { InterventionEntity } from '../../database/entities/intervention.entity'
import { NoteEntity } from '../../database/entities/note.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { RoutineRunEntity } from '../../database/entities/routine-run.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { UserPreferenceEntity } from '../../database/entities/user-preference.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { AgendaService, agendaReadFailure } from '../agenda/agenda.service'
import { MailboxService } from '../mailbox/mailbox.service'
import { SignalHistoryService } from '../signal-history/signal-history.service'
import { TasksService } from '../tasks/tasks.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { BriefingService } from './briefing.service'
import { freshSignalDetections } from './since-last-visit'

// #4009 — un `where` TypeORM appliqué à une ligne simulée, comme la base le
// ferait : égalité stricte, ou `Not(x)` (le seul opérateur que ces lectures
// posent). Un opérateur inconnu fait échouer le test plutôt que de passer.
function rowMatches(row: Record<string, unknown>, clause: Record<string, unknown>): boolean {
  return Object.entries(clause).every(([key, expected]) => {
    if (expected instanceof FindOperator) {
      if (expected.type === 'not') {
        const excluded = expected.value
        return Array.isArray(excluded) ? !excluded.includes(row[key]) : row[key] !== excluded
      }
      throw new Error(`rowMatches: opérateur ${expected.type} non simulé`)
    }
    return row[key] === expected
  })
}

/**
 * Ce que ces tests défendent : un brief incomplet doit se DIRE incomplet.
 *
 * Le pire résultat possible n'est pas une panne visible, c'est un brief qui
 * s'affiche « rien à faire aujourd'hui » parce que la messagerie n'était pas
 * connectée. C'est la version brief du garde-fou « ne pas afficher Active sans
 * connecteur ».
 */
describe('BriefingService', () => {
  const agenda = {
    status: jest.fn(),
    listEvents: jest.fn(),
    listEventsDetailed: jest.fn(),
    freeSlots: jest.fn(),
    createEvent: jest.fn(),
    deleteEvent: jest.fn(),
  }
  const mailbox = { status: jest.fn(), search: jest.fn() }
  const signalHistory = { listForWorkspace: jest.fn() }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(),
    isDemoWorkspace: jest.fn(),
    portfolioVisibilityOf: jest.fn(),
  }
  const accounts = { find: jest.fn(), findOne: jest.fn(), manager: { query: jest.fn() } }
  const profiles = { findOne: jest.fn() }
  // Les trois tables des quatre lignes « depuis ta dernière visite ». Déclarées
  // ici même quand un test ne les touche pas : Nest résout TOUT le constructeur
  // à la compilation du module de test, et un oubli casse les vingt autres.
  const activities = { count: jest.fn() }
  const contacts = { find: jest.fn(), manager: { query: jest.fn() } }
  const interventions = { count: jest.fn() }
  const userPreferences = { findOne: jest.fn(), save: jest.fn(), create: jest.fn() }
  const attackAngles = { count: jest.fn() }
  const routineRuns = { count: jest.fn() }
  const workflowRuns = { find: jest.fn() }
  const meetingNotes = { find: jest.fn() }
  const bellumCreatedEvents = { find: jest.fn(), insert: jest.fn() }
  const focusPlanBlockOutcomes = { upsert: jest.fn(), find: jest.fn() }
  const tasksService = { openForUser: jest.fn() }
  const esnProfiles = { findOne: jest.fn() }

  let service: BriefingService

  beforeEach(async () => {
    jest.resetAllMocks()
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws1' })
    workspaceContext.isDemoWorkspace.mockResolvedValue(false)
    // #2107.48 — le défaut historique (« open ») : les tests existants ne
    // couvrent pas le cloisonnement de portefeuille et doivent continuer à
    // voir tout l'espace, au SQL près.
    workspaceContext.portfolioVisibilityOf.mockResolvedValue('open')
    signalHistory.listForWorkspace.mockResolvedValue([])
    accounts.find.mockResolvedValue([])
    accounts.findOne.mockResolvedValue(null)
    accounts.manager.query.mockResolvedValue([])
    profiles.findOne.mockResolvedValue({ first_name: 'Théo' })
    userPreferences.findOne.mockResolvedValue(null)
    userPreferences.create.mockImplementation(value => value)
    userPreferences.save.mockImplementation(async value => value)
    attackAngles.count.mockResolvedValue(0)
    routineRuns.count.mockResolvedValue(0)
    workflowRuns.find.mockResolvedValue([])
    bellumCreatedEvents.find.mockResolvedValue([])
    bellumCreatedEvents.insert.mockResolvedValue(undefined)
    focusPlanBlockOutcomes.upsert.mockResolvedValue(undefined)
    tasksService.openForUser.mockResolvedValue([])
    esnProfiles.findOne.mockReset()
    esnProfiles.findOne.mockResolvedValue(null)

    const moduleRef = await Test.createTestingModule({
      providers: [
        BriefingService,
        { provide: AgendaService, useValue: agenda },
        { provide: MailboxService, useValue: mailbox },
        { provide: SignalHistoryService, useValue: signalHistory },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: getRepositoryToken(AccountEntity), useValue: accounts },
        { provide: getRepositoryToken(ActivityEntity), useValue: activities },
        { provide: getRepositoryToken(ContactEntity), useValue: contacts },
        { provide: getRepositoryToken(InterventionEntity), useValue: interventions },
        { provide: getRepositoryToken(ProfileEntity), useValue: profiles },
        { provide: getRepositoryToken(UserPreferenceEntity), useValue: userPreferences },
        { provide: getRepositoryToken(AttackAngleEntity), useValue: attackAngles },
        { provide: getRepositoryToken(RoutineRunEntity), useValue: routineRuns },
        { provide: getRepositoryToken(ActionPlanItemEntity), useValue: {} },
        { provide: getRepositoryToken(UserActionEntity), useValue: {} },
        { provide: getRepositoryToken(WorkflowRunEntity), useValue: workflowRuns },
        { provide: getRepositoryToken(NoteEntity), useValue: meetingNotes },
        { provide: getRepositoryToken(AgendaBellumCreatedEventEntity), useValue: bellumCreatedEvents },
        { provide: getRepositoryToken(FocusPlanBlockOutcomeEntity), useValue: focusPlanBlockOutcomes },
        { provide: getRepositoryToken(EsnProfileEntity), useValue: esnProfiles },
      ],
    }).compile()

    service = moduleRef.get(BriefingService)
  })

  const notConnected = { connected: false, provider: null, capabilities: {} }

  it('dit « pas connecté » plutôt que de rendre un brief vide', async () => {
    agenda.status.mockResolvedValue({ ...notConnected, capabilities: { read: false, write: false } })
    mailbox.status.mockResolvedValue({
      ...notConnected,
      address: null,
      capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
    })

    const briefing = await service.build('u1')

    expect(briefing.agenda.state).toBe('not_connected')
    expect(briefing.mail.state).toBe('not_connected')
    expect(agenda.listEventsDetailed).not.toHaveBeenCalled()
    expect(mailbox.search).not.toHaveBeenCalled()
  })

  it('distingue une portée manquante d’une absence de connexion', async () => {
    // Connecté mais avec un jeton trop étroit : l'écran doit proposer de
    // reconnecter, pas de connecter.
    agenda.status.mockResolvedValue({ connected: true, provider: 'google', capabilities: { read: false, write: true } })
    mailbox.status.mockResolvedValue({
      connected: true,
      provider: 'google',
      address: 'moi@bellum.fr',
      capabilities: { read: false, draft: true, send: true, labels: false, outOfOffice: false },
    })

    const briefing = await service.build('u1')

    expect(briefing.agenda.state).toBe('missing_scope')
    expect(briefing.mail.state).toBe('missing_scope')
  })

  it('une panne de la messagerie ne vide pas l’agenda', async () => {
    agenda.status.mockResolvedValue({ connected: true, provider: 'google', capabilities: { read: true, write: true } })
    agenda.listEventsDetailed.mockResolvedValue({ events: [], unavailable: [] })
    mailbox.status.mockRejectedValue(new Error('Graph 503'))

    const briefing = await service.build('u1')

    expect(briefing.mail.state).toBe('unavailable')
    expect(briefing.agenda.state).toBe('ready')
  })

  /**
   * #2098.9 — `readAt` PAR BLOC, jamais un seul `generatedAt` pour tout le
   * brief. Un agenda en panne et une messagerie fraîche ne doivent PAS
   * afficher la même heure — c'était la limite exacte que `SourcesStrip.tsx`
   * documentait avant ce lot (« aucune charge utile ne porte l'heure par
   * source »).
   */
  describe('readAt — la fraîcheur RÉELLE par source', () => {
    it('reste `null` pour une source non lue (jamais une heure devinée)', async () => {
      agenda.status.mockResolvedValue({ ...notConnected, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        ...notConnected,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })

      const briefing = await service.build('u1')

      expect(briefing.agenda.state).toBe('not_connected')
      expect(briefing.agenda.readAt).toBeNull()
      expect(briefing.mail.state).toBe('not_connected')
      expect(briefing.mail.readAt).toBeNull()
      // Aucun `TasksService` fourni à ce module de test : la capacité n'est
      // pas activée, donc jamais lue non plus.
      expect(briefing.tasks.state).toBe('unavailable')
      expect(briefing.tasks.readAt).toBeNull()
    })

    it('porte l’instant RÉEL de CETTE lecture quand la source répond', async () => {
      const now = new Date('2026-09-24T08:15:00.000Z')
      agenda.status.mockResolvedValue({
        connected: true,
        provider: 'google',
        capabilities: { read: true, write: true },
      })
      agenda.listEventsDetailed.mockResolvedValue({ events: [], unavailable: [] })
      mailbox.status.mockResolvedValue({
        connected: true,
        provider: 'google',
        address: 'moi@bellum.fr',
        capabilities: { read: true, draft: true, send: true, labels: false, outOfOffice: false },
      })
      mailbox.search.mockResolvedValue({ threads: [] })

      const briefing = await service.build('u1', now)

      expect(briefing.agenda.state).toBe('ready')
      expect(briefing.agenda.readAt).toBe(now.toISOString())
      expect(briefing.mail.state).toBe('ready')
      expect(briefing.mail.readAt).toBe(now.toISOString())
    })

    it('reste `null` sur une lecture `partial` ratée ET `unavailable`, jamais sur une lecture réussie', async () => {
      // `partial` : l'agenda A RÉPONDU (même incomplet) — `readAt` porte l'instant.
      agenda.status.mockResolvedValue({
        connected: true,
        provider: 'google',
        capabilities: { read: true, write: true },
      })
      agenda.listEventsDetailed.mockResolvedValue({
        events: [],
        unavailable: [{ provider: 'google', reason: 'events_unavailable' }],
      })
      // `unavailable` : la messagerie n'a RIEN pu lire.
      mailbox.status.mockRejectedValue(new Error('Graph 503'))
      const now = new Date('2026-09-24T08:15:00.000Z')

      const briefing = await service.build('u1', now)

      expect(briefing.agenda.state).toBe('partial')
      expect(briefing.agenda.readAt).toBe(now.toISOString())
      expect(briefing.mail.state).toBe('unavailable')
      expect(briefing.mail.readAt).toBeNull()
    })
  })

  /**
   * #3671.2 — recette prod 08/10 : le titre de la carte 1 du briefing était
   * pollué par le contenu brut d'un billet de train (PNR, places). Un e-mail
   * non commercial (billet, confirmation de voyage) ne doit produire AUCUNE
   * carte.
   */
  it('un e-billet de train ne produit AUCUNE carte — les fils commerciaux restent (#3671.2)', async () => {
    agenda.status.mockResolvedValue({ ...notConnected, capabilities: { read: false, write: false } })
    mailbox.status.mockResolvedValue({
      connected: true,
      provider: 'google',
      address: 'moi@bellum.fr',
      capabilities: { read: true, draft: true, send: true, labels: false, outOfOffice: false },
    })
    const ticketThread = {
      threadId: 'ticket-1',
      subject: 'E-billet SNCF Connect - Dossier PNR6R2XQP - 2 voyageurs',
      counterpart: 'noreply@sncf-connect.com',
      lastMessageAt: '2026-09-28T09:00:00.000Z',
      lastDirection: 'inbound' as const,
      messageCount: 1,
      awaitingReply: false,
      daysSinceLastMessage: 0,
      unread: true,
      hasAttachments: true,
      otherParticipants: [],
    }
    const commercialThread = {
      threadId: 'client-1',
      subject: 'Suite à notre échange',
      counterpart: 'jean@acme.com',
      lastMessageAt: '2026-09-28T09:00:00.000Z',
      lastDirection: 'inbound' as const,
      messageCount: 1,
      awaitingReply: false,
      daysSinceLastMessage: 0,
      unread: true,
      hasAttachments: false,
      otherParticipants: [],
    }
    mailbox.search.mockResolvedValue({ threads: [ticketThread, commercialThread] })

    const briefing = await service.build('u1', new Date('2026-09-28T10:00:00.000Z'))

    const unreadIds = briefing.mail.unread.map(thread => thread.threadId)
    expect(unreadIds).not.toContain('ticket-1')
    expect(unreadIds).toContain('client-1')
    // Le titre d'une carte issue de ce fil ne peut donc jamais porter le PNR.
    expect(briefing.actions.every(action => !JSON.stringify(action.labelVars).toLowerCase().includes('pnr'))).toBe(true)
  })

  /**
   * #3671.3 (GA-26) — recette prod 08/10 : la carte « Migration cloud »
   * annonçait 67 jours de retard, son détail 31 — la même échéance recalculée
   * à deux endroits. La lecture du brief rend maintenant `due_on` (jamais un
   * nombre de jours déjà fait) et le passe à `overdueDaysFromDueOn`, la MÊME
   * fonction que l'écran Encaissements (`overdueDaysAt`) et `reminderDue`.
   */
  it('le retard d’un paiement vient d’`overdueDaysFromDueOn`, jamais d’un second calcul (#3671.3)', async () => {
    agenda.status.mockResolvedValue({ ...notConnected, capabilities: { read: false, write: false } })
    mailbox.status.mockResolvedValue({
      ...notConnected,
      address: null,
      capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
    })
    accounts.manager.query.mockImplementation((sql: string) => {
      if (sql.includes('invoice_readiness') && sql.includes('due_on'))
        return Promise.resolve([{ id: 'mission-cloud', label: 'Migration cloud', due_on: '2026-08-01' }])
      return Promise.resolve([])
    })

    // 67 jours pleins entre le 01/08 et le 07/10 (NB : `overdueDaysFromDueOn`
    // compte en UTC minuit, exactement comme `overdueDaysAt`).
    const briefing = await service.build('u1', new Date('2026-10-07T10:00:00.000Z'))

    const paymentCard = briefing.actions.find(action => action.id === 'payment:mission-cloud')
    expect(paymentCard?.labelVars).toMatchObject({ days: 67 })
    expect(overdueDaysFromDueOn('2026-08-01', new Date('2026-10-07T10:00:00.000Z'))).toBe(67)
  })

  /**
   * #1936, lot 7A — le fuseau du CLIENT, optionnel, sans changer le
   * comportement quand il est absent (aucun appelant existant ne le passe).
   */
  describe('fuseau du client (3e argument, optionnel)', () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ ...notConnected, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        ...notConnected,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    it('sans fuseau, le comportement d’avant ce paramètre ne bouge pas — Europe/Paris', async () => {
      const briefing = await service.build('u1', new Date('2026-09-12T22:30:00.000Z'))
      // 22:30 UTC = 00:30 le 13/09 à Paris (UTC+2 en septembre).
      expect(briefing.timeZone).toBe('Europe/Paris')
      expect(briefing.date).toBe('2026-09-13')
    })

    it('un fuseau client valide change le jour couvert par le brief', async () => {
      const briefing = await service.build('u1', new Date('2026-09-12T22:30:00.000Z'), 'America/New_York')
      // 22:30 UTC = 18:30 le 12/09 à New York (UTC-4 en septembre) : encore le 12.
      expect(briefing.timeZone).toBe('America/New_York')
      expect(briefing.date).toBe('2026-09-12')
    })

    it('un fuseau client illisible retombe sur le fuseau par défaut, jamais une exception', async () => {
      const briefing = await service.build('u1', new Date('2026-09-12T22:30:00.000Z'), 'Not/AZone')
      expect(briefing.timeZone).toBe('Europe/Paris')
    })
  })

  it('un agenda muet ne se lit pas « aucun rendez-vous »', async () => {
    // Vécu en production : deux agendas branchés, l'API du premier éteinte
    // côté fournisseur, le second vide — le brief annonçait une journée libre
    // à quelqu'un dont la journée était pleine dans l'agenda qui s'était tu.
    agenda.status.mockResolvedValue({ connected: true, provider: 'google', capabilities: { read: true, write: true } })
    agenda.listEventsDetailed.mockResolvedValue({
      events: [],
      unavailable: [{ provider: 'google', reason: 'events_unavailable' }],
    })
    mailbox.status.mockResolvedValue({
      connected: false,
      provider: null,
      address: null,
      capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
    })

    const briefing = await service.build('u1')

    expect(briefing.agenda.state).toBe('partial')
    expect(briefing.agenda.reason).toBe('agenda_partial')
  })

  it('dit qu’un accès est ÉTEINT plutôt que « réessaie plus tard »', async () => {
    // Les deux se ressemblent à l'écran et n'appellent pas le même geste : un
    // accès coupé côté fournisseur ne repassera jamais tout seul.
    //
    // ⚠️ #1901.2 — CETTE FIXTURE INVENTAIT SA VALEUR. Elle construisait
    // l'exception à la main avec `reason: 'agenda_provider_api_disabled'`, un
    // motif que rien n'émet : le producteur réel est `agendaReadFailure` →
    // `connectorFailure`, qui pose `reason: input.code`, donc
    // `provider_api_disabled` — sans préfixe. Le test était vert, et l'écran
    // (`BlockState.tsx`, qui comparait à la valeur inventée) disait « réessaie
    // dans un moment » en production pour un accès éteint. On passe donc par le
    // VRAI producteur : une fixture qui invente ne garde rien.
    agenda.status.mockResolvedValue({ connected: true, provider: 'google', capabilities: { read: true, write: true } })
    agenda.listEventsDetailed.mockRejectedValue(
      agendaReadFailure(new Error('Calendar API has not been used in project 1234 before or it is disabled')),
    )
    mailbox.status.mockResolvedValue({
      connected: false,
      provider: null,
      address: null,
      capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
    })

    const briefing = await service.build('u1')

    expect(briefing.agenda.state).toBe('unavailable')
    expect(briefing.agenda.reason).toBe('provider_api_disabled')
  })

  it('#1901.2 — LE TÉMOIN : une panne ordinaire garde un motif DIFFÉRENT', () => {
    // Sans ce témoin, une garde qui accepterait tout passerait aussi.
    const ordinaire = agendaReadFailure(new Error('socket hang up'))
    const eteint = agendaReadFailure(
      new Error('Calendar API has not been used in project 1234 before or it is disabled'),
    )
    const reasonOf = (error: HttpException) => (error.getResponse() as { reason?: string }).reason

    expect(reasonOf(eteint)).toBe('provider_api_disabled')
    expect(reasonOf(ordinaire)).not.toBe('provider_api_disabled')
  })

  it('une recherche en échec ne perd pas les deux autres', async () => {
    agenda.status.mockResolvedValue({ connected: true, provider: 'google', capabilities: { read: true, write: true } })
    agenda.listEventsDetailed.mockResolvedValue({ events: [], unavailable: [] })
    mailbox.status.mockResolvedValue({
      connected: true,
      provider: 'google',
      address: 'moi@bellum.fr',
      capabilities: { read: true, draft: true, send: true, labels: false, outOfOffice: false },
    })
    mailbox.search
      .mockRejectedValueOnce(new Error('quota'))
      .mockResolvedValueOnce({ threads: [{ threadId: 'u1' }] })
      .mockResolvedValueOnce({ threads: [] })

    const briefing = await service.build('u1')

    expect(briefing.mail.state).toBe('ready')
    expect(briefing.mail.awaitingReply).toEqual([])
    expect(briefing.mail.unread).toHaveLength(1)
  })

  it('porte le prénom de l’utilisateur pour le tutoiement de l’interface', async () => {
    agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
    mailbox.status.mockResolvedValue({
      connected: false,
      provider: null,
      address: null,
      capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
    })

    const briefing = await service.build('u1')

    expect(briefing.firstName).toBe('Théo')
  })

  /**
   * #1936.11 — le brief varie selon le rôle, PAR L'ORDRE seul.
   *
   * L'ordonnancement lui-même est tenu genre par genre dans
   * `briefing-role-order.spec.ts` ; ce test-ci prouve l'APPELANT — que `build`
   * lit bien le rôle de l'espace actif, et qu'un rôle illisible n'emporte pas le
   * brief avec lui.
   */
  it('#1936.11 — lit le rôle de l’espace actif pour ordonner le brief', async () => {
    agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
    mailbox.status.mockResolvedValue({
      connected: false,
      provider: null,
      address: null,
      capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
    })
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws1', role: 'owner' })

    await service.build('u1')

    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u1')
  })

  it('#1936.11 — un rôle illisible ne fait pas disparaître le brief', async () => {
    agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
    mailbox.status.mockResolvedValue({
      connected: false,
      provider: null,
      address: null,
      capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
    })
    workspaceContext.resolveActiveWorkspace.mockRejectedValue(new Error('espace illisible'))

    const briefing = await service.build('u1')

    expect(briefing.actions).toEqual([])
    expect(briefing.firstName).toBe('Théo')
  })

  it('ne retient que les signaux apparus dans les 48 h', async () => {
    agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
    mailbox.status.mockResolvedValue({
      connected: false,
      provider: null,
      address: null,
      capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
    })
    const now = new Date('2026-08-03T08:00:00Z')
    signalHistory.listForWorkspace.mockResolvedValue([
      { account_id: 'a-fresh', status: 'active', first_detected_at: '2026-08-02T08:00:00Z' },
      { account_id: 'a-old', status: 'active', first_detected_at: '2026-07-01T08:00:00Z' },
      { account_id: 'a-resolved', status: 'resolved', first_detected_at: '2026-08-03T07:00:00Z' },
    ])
    accounts.find.mockResolvedValue([{ id: 'a-fresh', company_name: 'ACME' }])

    const briefing = await service.build('u1', now)

    expect(accounts.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: [expect.objectContaining({ id: 'a-fresh' })] }),
    )
    expect(briefing.accountsToWatch).toEqual([
      {
        accountId: 'a-fresh',
        companyName: 'ACME',
        reasonKey: 'briefing.account.freshSignal',
        href: '/accounts/a-fresh',
        // La DATE de la détection, remontée telle quelle : « Nouveau signal
        // détecté » ne disait ni lequel ni de quand, alors que la date était
        // dans la table depuis le début.
        detectedAt: '2026-08-02T08:00:00.000Z',
        detectionExact: true,
        // #2107.28 — la ligne mockée ne porte pas de `label` : `null`, jamais
        // une phrase inventée.
        signalLabel: null,
        signalSourceUrl: null,
        signalSourceKind: null,
        // #2097.21 — le mock ne porte pas de `logo_url` : `null`, jamais une
        // image devinée.
        logoUrl: null,
        // #2097.21 (correctif) — même raison, pour `website` : le mock ne le
        // porte pas non plus.
        website: null,
        // #2107.33 — sans `label`, aucune identité à rapparier : `null`, jamais
        // une raison devinée.
        esnReason: null,
        // #2107.40 — posé par le CONTRÔLEUR, pas ce service : `null` ici.
        structuralPotentialPaths: null,
        // #2107.42 — même raison.
        accessPath: null,
        history: [],
      },
    ])
  })

  // #4009 — une fiche supprimée (soft delete, `status = 'deleted'`) garde son
  // historique de signaux : le brief ne doit pourtant jamais la citer
  // (décision Louis 11/10, #3670). Le faux `find` APPLIQUE le `where` comme la
  // base le ferait — sans la borne de statut, ALTRAN ressort.
  it('ne cite jamais un compte supprimé parmi les comptes à surveiller (#4009)', async () => {
    agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
    mailbox.status.mockResolvedValue({
      connected: false,
      provider: null,
      address: null,
      capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
    })
    const now = new Date('2026-08-03T08:00:00Z')
    signalHistory.listForWorkspace.mockResolvedValue([
      { account_id: 'a-living', status: 'active', first_detected_at: '2026-08-02T08:00:00Z' },
      { account_id: 'a-deleted', status: 'active', first_detected_at: '2026-08-02T09:00:00Z' },
    ])
    const table = [
      { id: 'a-living', company_name: 'ACME', status: 'completed' },
      { id: 'a-deleted', company_name: 'ALTRAN TECHNOLOGIES', status: 'deleted' },
    ]
    accounts.find.mockImplementation(async ({ where }: { where: Array<Record<string, unknown>> }) =>
      table.filter(row => where.some(clause => rowMatches(row, clause))),
    )

    const briefing = await service.build('u1', now)

    expect(briefing.accountsToWatch.map(account => account.companyName)).toEqual(['ACME'])
  })

  // #2107.33 — « la raison pour laquelle cela concerne cette ESN » : la lecture
  // commerciale que l'analyse a déjà écrite SUR CE SIGNAL, rapparié par identité
  // avec `recent_signals` — jamais une phrase générique sur le compte.
  it('porte la raison ESN du signal le plus récent jusqu’au compte à surveiller (#2107.33)', async () => {
    agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
    mailbox.status.mockResolvedValue({
      connected: false,
      provider: null,
      address: null,
      capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
    })
    const now = new Date('2026-08-03T08:00:00Z')
    signalHistory.listForWorkspace.mockResolvedValue([
      {
        account_id: 'a-fresh',
        status: 'active',
        first_detected_at: '2026-08-02T08:00:00Z',
        label: 'Levée de fonds Série B',
      },
    ])
    accounts.find.mockResolvedValue([
      {
        id: 'a-fresh',
        company_name: 'ACME',
        recent_signals: [
          { signal: 'Levée de fonds Série B', sales_implication: 'Budget IT en hausse.' },
          { signal: 'Nomination DSI', sales_implication: 'Fenêtre de re-référencement ouverte.' },
        ],
      },
    ])

    const briefing = await service.build('u1', now)

    expect(briefing.accountsToWatch[0]?.esnReason).toBe('Budget IT en hausse.')
  })

  it('n’invente pas de raison ESN quand la lecture commerciale est absente du signal (#2107.33)', async () => {
    agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
    mailbox.status.mockResolvedValue({
      connected: false,
      provider: null,
      address: null,
      capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
    })
    const now = new Date('2026-08-03T08:00:00Z')
    signalHistory.listForWorkspace.mockResolvedValue([
      {
        account_id: 'a-fresh',
        status: 'active',
        first_detected_at: '2026-08-02T08:00:00Z',
        label: 'Levée de fonds Série B',
      },
    ])
    accounts.find.mockResolvedValue([
      { id: 'a-fresh', company_name: 'ACME', recent_signals: [{ signal: 'Levée de fonds Série B' }] },
    ])

    const briefing = await service.build('u1', now)

    expect(briefing.accountsToWatch[0]?.esnReason).toBeNull()
  })

  // #2097.21 (correctif) — mesuré en prod le 25/09 : `logo_url` seul (le logo
  // Apollo persisté, quasi toujours vide) ne fait jamais apparaître d'image.
  // `website` porte le MÊME repli favicon que `/accounts`
  // (`AccountTableRow.tsx`) — cette ligne prouve qu'il VOYAGE jusqu'au brief.
  it('porte le site du compte jusqu’au compte à surveiller, pour le repli favicon (#2097.21)', async () => {
    agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
    mailbox.status.mockResolvedValue({
      connected: false,
      provider: null,
      address: null,
      capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
    })
    const now = new Date('2026-08-03T08:00:00Z')
    signalHistory.listForWorkspace.mockResolvedValue([
      { account_id: 'a-fresh', status: 'active', first_detected_at: '2026-08-02T08:00:00Z' },
    ])
    accounts.find.mockResolvedValue([{ id: 'a-fresh', company_name: 'ACME', website: 'https://acme.example' }])

    const briefing = await service.build('u1', now)

    expect(briefing.accountsToWatch[0]).toMatchObject({ website: 'https://acme.example' })
  })

  // #4068.6 — les faits HISTORIQUES du compte (lecteur unique, porte `ACCOUNT_FACTS_READER`, GA-07),
  // datés et typés, jamais d'où ils viennent, jamais présentés comme récents.
  describe('#4068.6 — l’historique daté du compte à surveiller', () => {
    const fact = (kind: string, date: string, label: string, extra: Record<string, unknown> = {}) => ({
      kind,
      date,
      label,
      weight: 2.5,
      ageDays: 400,
      ...extra,
    })

    async function withReader(reader: unknown): Promise<BriefingService> {
      const moduleRef = await Test.createTestingModule({
        providers: [
          BriefingService,
          { provide: AgendaService, useValue: agenda },
          { provide: MailboxService, useValue: mailbox },
          { provide: SignalHistoryService, useValue: signalHistory },
          { provide: WorkspaceContextService, useValue: workspaceContext },
          { provide: getRepositoryToken(AccountEntity), useValue: accounts },
          { provide: getRepositoryToken(ActivityEntity), useValue: activities },
          { provide: getRepositoryToken(ContactEntity), useValue: contacts },
          { provide: getRepositoryToken(InterventionEntity), useValue: interventions },
          { provide: getRepositoryToken(ProfileEntity), useValue: profiles },
          { provide: getRepositoryToken(UserPreferenceEntity), useValue: userPreferences },
          { provide: getRepositoryToken(AttackAngleEntity), useValue: attackAngles },
          { provide: getRepositoryToken(RoutineRunEntity), useValue: routineRuns },
          { provide: getRepositoryToken(ActionPlanItemEntity), useValue: {} },
          { provide: getRepositoryToken(UserActionEntity), useValue: {} },
          { provide: getRepositoryToken(WorkflowRunEntity), useValue: workflowRuns },
          { provide: getRepositoryToken(NoteEntity), useValue: meetingNotes },
          { provide: getRepositoryToken(AgendaBellumCreatedEventEntity), useValue: bellumCreatedEvents },
          { provide: getRepositoryToken(FocusPlanBlockOutcomeEntity), useValue: focusPlanBlockOutcomes },
          { provide: getRepositoryToken(EsnProfileEntity), useValue: esnProfiles },
          { provide: 'ACCOUNT_FACTS_READER', useValue: reader },
        ],
      }).compile()
      return moduleRef.get(BriefingService)
    }

    function oneFreshAccount(): Date {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
      signalHistory.listForWorkspace.mockResolvedValue([
        { account_id: 'a-fresh', status: 'active', first_detected_at: '2026-08-02T08:00:00Z' },
      ])
      accounts.find.mockResolvedValue([{ id: 'a-fresh', company_name: 'ACME', user_id: 'u1', workspace_id: 'ws1' }])
      return new Date('2026-08-03T08:00:00Z')
    }

    it('porte au plus trois faits datés et typés — sans poids, sans âge, sans provenance', async () => {
      const now = oneFreshAccount()
      const forAccount = jest.fn().mockResolvedValue({
        asOf: now.toISOString(),
        facts: [
          fact('deal_lost', '2025-06-01', 'Affaire perdue : Migration cloud'),
          fact('mission', '2024-11-01', 'Mission TMA', { url: 'https://example.test/m' }),
          fact('need', '2025-01-10', 'Besoin Data'),
          fact('note', '2025-02-10', 'Une quatrième ligne'),
        ],
      })
      const briefing = await (await withReader({ forAccount })).build('u1', now)
      expect(forAccount).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws1', accountId: 'a-fresh' }))
      const history = briefing.accountsToWatch[0]?.history ?? []
      expect(history.map(h => h.kind)).toEqual(['deal_lost', 'mission', 'need'])
      expect(history[0]).toEqual({ kind: 'deal_lost', date: '2025-06-01', label: 'Affaire perdue : Migration cloud' })
      expect(JSON.stringify(history)).not.toMatch(/weight|ageDays/)
    })

    it('sait dire NON : sans lecteur, ou lecteur en panne, la carte reste et son historique est vide', async () => {
      const now = oneFreshAccount()
      expect((await (await withReader(undefined)).build('u1', now)).accountsToWatch[0]?.history).toEqual([])
      const broken = { forAccount: jest.fn().mockRejectedValue(new Error('boom')) }
      const briefing = await (await withReader(broken)).build('u1', now)
      expect(briefing.accountsToWatch.map(a => a.companyName)).toEqual(['ACME'])
      expect(briefing.accountsToWatch[0]?.history).toEqual([])
    })
  })

  // #2107.28 — « Ne plus afficher seulement le nom du compte » : la carte doit
  // pouvoir dire CE QUI a bougé, pas seulement QUAND. Le libellé était déjà
  // écrit dans `signal_history.label` — cette ligne prouve qu'il VOYAGE
  // jusqu'au brief, plutôt que de rester une colonne que personne ne lit.
  it('porte le libellé du signal le plus récent jusqu’au compte à surveiller (#2107.28)', async () => {
    agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
    mailbox.status.mockResolvedValue({
      connected: false,
      provider: null,
      address: null,
      capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
    })
    const now = new Date('2026-08-03T08:00:00Z')
    signalHistory.listForWorkspace.mockResolvedValue([
      {
        account_id: 'a-fresh',
        status: 'active',
        first_detected_at: '2026-08-02T08:00:00Z',
        label: 'Levée de fonds Série B',
      },
    ])
    accounts.find.mockResolvedValue([{ id: 'a-fresh', company_name: 'ACME' }])

    const briefing = await service.build('u1', now)

    expect(briefing.accountsToWatch[0]?.signalLabel).toBe('Levée de fonds Série B')
    // Sans URL vérifiable sur le signal : aucun lien, rien n'est inventé.
    expect(briefing.accountsToWatch[0]?.signalSourceUrl).toBeNull()
  })

  // Théo A today-jour — « sources cliquables, visibles directement » : le lien vers la page d'origine du signal
  // voyage jusqu'à la carte (l'éditeur, jamais notre fournisseur intermédiaire).
  it('porte le lien de la page d’origine du signal jusqu’au compte à surveiller', async () => {
    agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
    mailbox.status.mockResolvedValue({
      connected: false,
      provider: null,
      address: null,
      capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
    })
    const now = new Date('2026-08-03T08:00:00Z')
    signalHistory.listForWorkspace.mockResolvedValue([
      {
        account_id: 'a-fresh',
        status: 'active',
        first_detected_at: '2026-08-02T08:00:00Z',
        label: 'Levée de fonds Série B',
      },
    ])
    accounts.find.mockResolvedValue([
      {
        id: 'a-fresh',
        company_name: 'ACME',
        recent_signals: [
          { signal: 'Levée de fonds Série B', url: 'https://www.lesechos.fr/tech/serie-b-acme', source_kind: 'press' },
        ],
      },
    ])

    const briefing = await service.build('u1', now)

    expect(briefing.accountsToWatch[0]?.signalSourceUrl).toBe('https://www.lesechos.fr/tech/serie-b-acme')
    expect(briefing.accountsToWatch[0]?.signalSourceKind).toBe('press')
  })

  it('ne date pas un signal dont la détection est illisible — pas de repli sur aujourd’hui', () => {
    // Le seul repli acceptable est `null` : y mettre l'instant du brief
    // afficherait « repéré aujourd'hui » sur un signal d'un autre jour.
    expect(
      freshSignalDetections([{ account_id: 'a', status: 'active', first_detected_at: 'n’importe quoi' }], 0),
    ).toEqual(new Map())
  })

  it('un signal issu du backfill se dit « suivi depuis », pas « repéré le »', () => {
    const detections = freshSignalDetections(
      [
        {
          account_id: 'a',
          status: 'active',
          first_detected_at: '2026-08-02T08:00:00Z',
          first_detection_exact: false,
        },
      ],
      0,
    )
    expect(detections.get('a')).toEqual({ detectedAt: '2026-08-02T08:00:00.000Z', exact: false, label: null })
  })

  // #2107.28 — le libellé suit la MÊME règle que la date : celui de la
  // détection retenue (la plus récente), jamais recopié d'une autre ligne.
  it('porte le libellé de la détection retenue (#2107.28)', () => {
    const detections = freshSignalDetections(
      [
        {
          account_id: 'a',
          status: 'active',
          first_detected_at: '2026-08-02T08:00:00Z',
          label: 'Levée de fonds Série B',
        },
      ],
      0,
    )
    expect(detections.get('a')?.label).toBe('Levée de fonds Série B')
  })

  it('un libellé absent reste `null`, jamais une chaîne vide', () => {
    const detections = freshSignalDetections(
      [{ account_id: 'a', status: 'active', first_detected_at: '2026-08-02T08:00:00Z' }],
      0,
    )
    expect(detections.get('a')?.label).toBeNull()
  })

  /**
   * #2107.3 — les besoins ouverts sans shortlist entrent dans « À faire
   * maintenant ». Doublon de #2106.7, livré avec la même preuve.
   */
  describe('besoins sans shortlist (#2107.3)', () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    it('ouvre le besoin lui-même dans les actions du jour', async () => {
      accounts.manager.query.mockResolvedValue([{ id: 'need-1', title: 'DevOps confirmé', days: 9 }])

      const briefing = await service.build('u1')

      expect(accounts.manager.query).toHaveBeenCalledWith(expect.any(String), ['ws1', 5])
      expect(briefing.actions).toContainEqual(
        expect.objectContaining({ id: 'need:need-1', kind: 'need_stale', href: '/projects/needs/need-1' }),
      )
    })

    // #3389.13 — l'autre moitié de la même lecture : une veille dont la reprise
    // prévue est échue remonte avec SA date, et sa carte dit la reprise.
    it('une veille à reprise échue ouvre le besoin et nomme la date posée', async () => {
      accounts.manager.query.mockResolvedValue([
        { id: 'need-hold', title: 'Chef de projet', days: 3, resume_on: '2026-07-30' },
      ])

      const briefing = await service.build('u1')

      expect(accounts.manager.query).toHaveBeenCalledWith(expect.stringContaining("n.status = 'on_hold'"), ['ws1', 5])
      expect(briefing.actions).toContainEqual(
        expect.objectContaining({
          id: 'need:need-hold',
          kind: 'need_stale',
          labelKey: 'briefing.actions.needResumeDue',
          href: '/projects/needs/need-hold',
        }),
      )
    })

    it('une lecture SQL en échec ne fait pas disparaître le brief', async () => {
      accounts.manager.query.mockRejectedValue(new Error('project_needs indisponible'))

      const briefing = await service.build('u1')

      expect(briefing.actions.some(action => action.kind === 'need_stale')).toBe(false)
    })

    it('un espace illisible ne fait pas disparaître le brief', async () => {
      workspaceContext.resolveActiveWorkspace.mockRejectedValue(new Error('espace illisible'))

      const briefing = await service.build('u1')

      expect(briefing.actions.some(action => action.kind === 'need_stale')).toBe(false)
    })
  })

  /**
   * #2106.8 / #2107.7 — missions entrant dans une fenêtre de renouvellement
   * (J-45/J-30/J-15). `renewalWindow` (`@bellum/contracts`) classe, cette
   * méthode ne fait que lire `missions`/`workspaces` et lui passer la main.
   */
  describe('missions à échéance de renouvellement (#2106.8, #2107.7)', () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    const now = new Date('2026-08-03T00:00:00.000Z')

    function mockMissionsQuery(missionRows: unknown[], renewalWindowDays: unknown = null) {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM workspaces')) return Promise.resolve([{ renewal_window_days: renewalWindowDays }])
        if (sql.includes('FROM missions')) return Promise.resolve(missionRows)
        return Promise.resolve([])
      })
    }

    it('ouvre la mission elle-même dans les actions du jour', async () => {
      // now + 25 jours : tombe dans la fenêtre j30 par défaut (15 < 25 <= 30).
      mockMissionsQuery([{ id: 'm-1', label: 'DevOps chez ACME', ends_on: '2026-08-28' }])

      const briefing = await service.build('u1', now)

      expect(briefing.actions).toContainEqual(
        expect.objectContaining({ id: 'mission-end:m-1', kind: 'mission_end', href: '/missions/m-1' }),
      )
    })

    it('nomme le seuil RÉGLÉ par l’espace, pas 45/30/15 recopiés en dur', async () => {
      // Échelle personnalisée : j15=15, j30=25, j45=40, j60=60 (le plancher
      // `RENEWAL_WINDOW_FLOOR_DAYS` interdit une borne sous 15 jours). La
      // mission à 20 jours tombe dans la fenêtre j30 de CET espace (15 < 20 <= 25).
      mockMissionsQuery([{ id: 'm-1', label: 'DevOps chez ACME', ends_on: '2026-08-23' }], [15, 25, 40, 60])

      const briefing = await service.build('u1', now)

      const card = briefing.actions.find(action => action.kind === 'mission_end')
      expect(card?.context).toEqual({ labelKey: 'briefing.context.missionEndingWithin', labelVars: { days: 25 } })
    })

    it('exclut une mission sans date de fin, terminée, ou hors des trois fenêtres', async () => {
      mockMissionsQuery([]) // `ends_on IS NOT NULL AND status = 'active'` filtre déjà côté SQL

      const briefing = await service.build('u1', now)

      expect(briefing.actions.some(action => action.kind === 'mission_end')).toBe(false)
    })

    it('une lecture SQL en échec ne fait pas disparaître le brief', async () => {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM missions')) return Promise.reject(new Error('missions indisponible'))
        return Promise.resolve([])
      })

      const briefing = await service.build('u1', now)

      expect(briefing.actions.some(action => action.kind === 'mission_end')).toBe(false)
    })
  })

  /**
   * #2147.5 (épopée #2785) — LA CARTE DE SUIVI D'UN JOB EN COURS.
   *
   * Deux types de job réels aujourd'hui : une analyse de compte `analyzing`
   * (six champs restent `null`, jamais devinés), et le job composite de Laura
   * (#2276, correctif 26/09 soir) qui porte réellement ces cinq champs.
   */
  describe('jobs en cours — la carte de suivi (#2147.5)', () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    it('affiche une analyse en cours, sans inventer les champs qu’elle ne porte pas', async () => {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM analysis_runs'))
          return Promise.resolve([{ run_id: 'run-1', account_id: 'acc-1', company_name: 'ACME' }])
        return Promise.resolve([])
      })

      const briefing = await service.build('u1')

      expect(briefing.runningJobs).toEqual([
        {
          id: 'run-1',
          kind: 'account_analysis',
          title: 'ACME',
          currentStepLabel: 'analyzing',
          progressSteps: null,
          reservedCredits: null,
          estimatedDurationMinutes: null,
          intermediateResults: null,
          pendingValidations: null,
          openHref: '/accounts/acc-1',
          cancelable: true,
        },
      ])
    })

    it('aucune analyse en cours : liste vide, pas de carte inventée', async () => {
      const briefing = await service.build('u1')
      expect(briefing.runningJobs).toEqual([])
    })

    it('une lecture SQL en échec ne fait pas disparaître le brief', async () => {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM analysis_runs')) return Promise.reject(new Error('analysis_runs indisponible'))
        return Promise.resolve([])
      })

      const briefing = await service.build('u1')

      expect(briefing.runningJobs).toEqual([])
    })

    /**
     * #2147.5 (correctif 26/09 soir) — le job composite de Laura porte
     * RÉELLEMENT les cinq champs que l'analyse de compte ne porte pas : ce
     * test le prouve sur un job à deux étapes, une faite et une en cours.
     */
    it('affiche un job Laura en cours, avec progression, coût réservé et étape réelle', async () => {
      workflowRuns.find.mockResolvedValue([
        {
          id: 'job-1',
          status: 'running',
          conversation_id: 'conv-1',
          account_id: null,
          job: {
            originalRequest: 'Trouve 20 filiales et prépare leurs messages',
            intent: 'Préparer la campagne filiales',
            expectedOutcome: '20 messages prêts',
            scope: { description: 'Filiales du groupe' },
            estimatedDurationSeconds: 600,
            steps: [
              { key: 'find', label: 'Trouver les filiales', capability: 'account_analysis', units: 1, status: 'done' },
              {
                key: 'msg',
                label: 'Préparer les messages',
                capability: 'account_analysis',
                units: 1,
                status: 'todo',
                dependsOn: ['find'],
              },
            ],
          },
        },
      ])

      const briefing = await service.build('u1')

      expect(briefing.runningJobs).toEqual([
        {
          id: 'job-1',
          kind: 'laura_job',
          title: 'Préparer la campagne filiales',
          currentStepLabel: 'Préparer les messages',
          progressSteps: { done: 1, total: 2 },
          // Deux unités d'analyse Rapide à 5 crédits chacune (tarif RAB, Louis 10/10).
          reservedCredits: 10,
          estimatedDurationMinutes: 10,
          intermediateResults: null,
          pendingValidations: null,
          openHref: '/chat?conversationId=conv-1',
          cancelable: true,
        },
      ])
    })

    it('une fiche de job Laura illisible ne fait pas disparaître le brief', async () => {
      workflowRuns.find.mockResolvedValue([
        { id: 'job-bad', status: 'running', conversation_id: null, account_id: null, job: { broken: true } },
      ])

      const briefing = await service.build('u1')

      expect(briefing.runningJobs).toEqual([])
    })

    it('une lecture workflow_runs en échec ne fait pas disparaître le brief', async () => {
      workflowRuns.find.mockRejectedValue(new Error('workflow_runs indisponible'))

      const briefing = await service.build('u1')

      expect(briefing.runningJobs).toEqual([])
    })
  })

  describe('consultants qui se libèrent bientôt (#2106.6)', () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    const now = new Date('2026-08-03T00:00:00.000Z')

    function mockConsultantsQuery(rows: unknown[]) {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM mission_assignments')) return Promise.resolve(rows)
        return Promise.resolve([])
      })
    }

    it('ouvre la fiche du consultant dans les actions du jour', async () => {
      mockConsultantsQuery([{ consultant_id: 'c-1', full_name: 'Yanis Berthier', ends_on: '2026-08-15' }])

      const briefing = await service.build('u1', now)

      expect(briefing.actions).toContainEqual(
        expect.objectContaining({
          id: 'consultant-available:c-1',
          kind: 'consultant_available',
          href: '/consultants/c-1',
        }),
      )
    })

    it('sans consultant qui se libère, absent des actions du jour', async () => {
      mockConsultantsQuery([])

      const briefing = await service.build('u1', now)

      expect(briefing.actions.some(action => action.kind === 'consultant_available')).toBe(false)
    })

    it('une lecture SQL en échec ne fait pas disparaître le brief', async () => {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM mission_assignments')) return Promise.reject(new Error('affectations indisponibles'))
        return Promise.resolve([])
      })

      const briefing = await service.build('u1', now)

      expect(briefing.actions.some(action => action.kind === 'consultant_available')).toBe(false)
    })
  })

  // #2107.6 — disponibilités jamais reconfirmées depuis plus de 60 jours,
  // routine `TalentRoutinesService.availabilityToReconfirm` déjà existante,
  // câblée ici à « Aujourd'hui » (l'appelant réel manquait).
  describe('disponibilités à reconfirmer (#2107.6)', () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    const now = new Date('2026-08-03T00:00:00.000Z')

    function mockAvailabilityQuery(rows: unknown[]) {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM consultants c')) return Promise.resolve(rows)
        return Promise.resolve([])
      })
    }

    it('ouvre la fiche du consultant dans les actions du jour', async () => {
      mockAvailabilityQuery([{ id: 'c-1', full_name: 'Yanis Berthier', days: 74 }])

      const briefing = await service.build('u1', now)

      expect(briefing.actions).toContainEqual(
        expect.objectContaining({
          id: 'availability-reconfirm:c-1',
          kind: 'availability_reconfirm',
          href: '/consultants/c-1',
        }),
      )
    })

    it('sans disponibilité à reconfirmer, absente des actions du jour', async () => {
      mockAvailabilityQuery([])

      const briefing = await service.build('u1', now)

      expect(briefing.actions.some(action => action.kind === 'availability_reconfirm')).toBe(false)
    })

    it('une lecture SQL en échec ne fait pas disparaître le brief', async () => {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM consultants c')) return Promise.reject(new Error('disponibilités indisponibles'))
        return Promise.resolve([])
      })

      const briefing = await service.build('u1', now)

      expect(briefing.actions.some(action => action.kind === 'availability_reconfirm')).toBe(false)
    })
  })

  describe('affaires sans prochaine action (#2106.9, #2107.1)', () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    const now = new Date('2026-08-03T00:00:00.000Z')

    function mockProjectHealthQuery(rows: unknown[]) {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM opportunities o')) return Promise.resolve(rows)
        return Promise.resolve([])
      })
    }

    it('#2106.9 (recette 26/09) — un projet créé le JOUR MÊME sans prochaine action n’apparaît pas encore : seuil d’un jour, tranché sans Louis', async () => {
      mockProjectHealthQuery([
        {
          id: 'p-today',
          label: 'RECETTE',
          company_name: 'LVMH',
          stage: 'qualified',
          stage_entered_at: now.toISOString(),
          has_next_action: false,
          days: 0,
        },
      ])

      const briefing = await service.build('u1', now)

      expect(briefing.actions.some(action => action.kind === 'project_no_next_action')).toBe(false)
    })

    it('#2106.9 — dès le LENDEMAIN de sa création, un projet sans prochaine action apparaît', async () => {
      mockProjectHealthQuery([
        {
          id: 'p-yesterday',
          label: 'RECETTE',
          company_name: 'LVMH',
          stage: 'qualified',
          stage_entered_at: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
          has_next_action: false,
          days: 1,
        },
      ])

      const briefing = await service.build('u1', now)

      expect(briefing.actions).toContainEqual(
        expect.objectContaining({ id: 'project-no-next-action:p-yesterday', kind: 'project_no_next_action' }),
      )
    })

    it('ouvre le dossier du projet quand aucune tâche n’est encore ouverte', async () => {
      mockProjectHealthQuery([
        {
          id: 'p-1',
          label: 'Portail transporteurs',
          company_name: 'ACME',
          stage: 'confirmed',
          stage_entered_at: '2026-07-29T00:00:00.000Z', // 5 jours — bien en deçà des 30 jours de fraîcheur
          has_next_action: false,
          days: 5,
        },
      ])

      const briefing = await service.build('u1', now)

      expect(briefing.actions).toContainEqual(
        expect.objectContaining({
          id: 'project-no-next-action:p-1',
          kind: 'project_no_next_action',
          href: '/projects/p-1',
        }),
      )
    })

    it('une affaire avec une tâche déjà ouverte n’apparaît pas', async () => {
      mockProjectHealthQuery([
        {
          id: 'p-2',
          label: 'Schéma directeur data',
          company_name: 'ACME',
          stage: 'negotiation',
          stage_entered_at: '2026-06-29T00:00:00.000Z',
          has_next_action: true,
          days: 35,
        },
      ])

      const briefing = await service.build('u1', now)

      expect(briefing.actions.some(action => action.kind === 'project_no_next_action')).toBe(false)
    })

    it('sans affaire concernée, absente des actions du jour', async () => {
      mockProjectHealthQuery([])

      const briefing = await service.build('u1', now)

      expect(briefing.actions.some(action => action.kind === 'project_no_next_action')).toBe(false)
    })

    it('une lecture SQL en échec ne fait pas disparaître le brief', async () => {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM opportunities o')) return Promise.reject(new Error('affaires indisponibles'))
        return Promise.resolve([])
      })

      const briefing = await service.build('u1', now)

      expect(briefing.actions.some(action => action.kind === 'project_no_next_action')).toBe(false)
    })

    /**
     * #3714.6 (reste, audité lot R9) — MÊME NO-GO que `ProjectPipelineService.health`
     * (#2324.48, `pipelineHealth`) : un signal qu'aucun humain n'a adopté des
     * deux mains (un porteur ET une prochaine action) n'est pas une affaire
     * « sans prochaine action ». La lecture SQL de ce brief doit porter `kind`
     * ET `owner_id` (comme le pipe) pour que `isUnapprovedSignal` puisse
     * s'appliquer — sans eux, le NO-GO ne pouvait jamais se déclencher ici.
     */
    it('#3714.6 — un signal non adopté (sans porteur) n’apparaît PAS comme « sans prochaine action »', async () => {
      mockProjectHealthQuery([
        {
          id: 'p-signal',
          label: 'Détecté par Laura',
          company_name: 'ACME',
          stage: 'qualified',
          stage_entered_at: '2026-07-29T00:00:00.000Z',
          has_next_action: false,
          days: 5,
          kind: 'signal',
          owner_id: null,
        },
      ])

      const briefing = await service.build('u1', now)

      expect(briefing.actions.some(action => action.kind === 'project_no_next_action')).toBe(false)
    })

    it('#3714.6 — la lecture SQL porte bien `kind` et `owner_id` (sans eux, le NO-GO ne peut jamais se déclencher)', async () => {
      mockProjectHealthQuery([])
      await service.build('u1', now)
      const call = accounts.manager.query.mock.calls.find(([sql]: [string]) => sql.includes('FROM opportunities o'))
      expect(call?.[0]).toMatch(/\bo\.kind\b/)
      expect(call?.[0]).toMatch(/\bo\.owner_id\b/)
    })
  })

  describe('affaires vieillissantes (#2107.2)', () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    const now = new Date('2026-08-03T00:00:00.000Z')

    function mockProjectHealthQuery(rows: unknown[]) {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM opportunities o')) return Promise.resolve(rows)
        return Promise.resolve([])
      })
    }

    it('ouvre le dossier du projet quand la fraîcheur a dépassé le seuil', async () => {
      mockProjectHealthQuery([
        {
          id: 'p-2',
          label: 'Schéma directeur data',
          company_name: 'ACME',
          stage: 'confirmed',
          stage_entered_at: '2026-05-20T00:00:00.000Z', // 75 jours — au-delà des 30 jours de fraîcheur
          has_next_action: true,
          days: 75,
        },
      ])

      const briefing = await service.build('u1', now)

      expect(briefing.actions).toContainEqual(
        expect.objectContaining({
          id: 'project-stale:p-2',
          kind: 'project_stale',
          href: '/projects/p-2',
          labelVars: { label: 'Schéma directeur data', company: 'ACME', days: 75 },
        }),
      )
    })

    it('une affaire encore fraîche n’apparaît pas', async () => {
      mockProjectHealthQuery([
        {
          id: 'p-3',
          label: 'Portail RH',
          company_name: 'ACME',
          stage: 'confirmed',
          stage_entered_at: '2026-07-29T00:00:00.000Z', // 5 jours
          has_next_action: true,
          days: 5,
        },
      ])

      const briefing = await service.build('u1', now)

      expect(briefing.actions.some(action => action.kind === 'project_stale')).toBe(false)
    })

    it('sans affaire concernée, absente des actions du jour', async () => {
      mockProjectHealthQuery([])

      const briefing = await service.build('u1', now)

      expect(briefing.actions.some(action => action.kind === 'project_stale')).toBe(false)
    })

    it('une lecture SQL en échec ne fait pas disparaître le brief', async () => {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM opportunities o')) return Promise.reject(new Error('affaires indisponibles'))
        return Promise.resolve([])
      })

      const briefing = await service.build('u1', now)

      expect(briefing.actions.some(action => action.kind === 'project_stale')).toBe(false)
    })

    // #3714.6 (reste, audité lot R9) — même NO-GO que ci-dessus, pour la carte « vieillissante ».
    it('#3714.6 — un signal non adopté (sans porteur) n’apparaît PAS comme « vieillissante »', async () => {
      mockProjectHealthQuery([
        {
          id: 'p-signal',
          label: 'Détecté par Laura',
          company_name: 'ACME',
          stage: 'confirmed',
          stage_entered_at: '2026-05-20T00:00:00.000Z',
          has_next_action: true,
          days: 75,
          kind: 'signal',
          owner_id: null,
        },
      ])

      const briefing = await service.build('u1', now)

      expect(briefing.actions.some(action => action.kind === 'project_stale')).toBe(false)
    })
  })

  /**
   * #2397.7 — POSE et LIT le retour utilisateur sur le classement, dans le
   * MÊME sac que `MemoryService.patchPreferences` (`user_preferences`), lu ici
   * en entité pour ne pas faire monter GA-07 (docblock `briefing.module.ts`).
   */
  describe('setRoleFit / readRoleFit (#2397.7)', () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    it('POSE le geste sur un sac vide — upsert (create) quand la ligne n’existe pas', async () => {
      userPreferences.findOne.mockResolvedValue(null)

      await service.setRoleFit('u1', 'follow_up', true)

      expect(userPreferences.create).toHaveBeenCalledWith({
        user_id: 'u1',
        preferences: { briefingRoleFit: { follow_up: true } },
      })
      expect(userPreferences.save).toHaveBeenCalled()
    })

    it('FUSIONNE avec un sac existant, sans écraser les autres réglages ni les autres genres', async () => {
      const existing = { user_id: 'u1', preferences: { tone: 'tutoiement', briefingRoleFit: { account: true } } }
      userPreferences.findOne.mockResolvedValue(existing)

      await service.setRoleFit('u1', 'follow_up', true)

      expect(userPreferences.save).toHaveBeenCalledWith({
        user_id: 'u1',
        preferences: { tone: 'tutoiement', briefingRoleFit: { account: true, follow_up: true } },
      })
    })

    it('engaged=false RETIRE le genre — jamais un `false` stocké', async () => {
      const existing = { user_id: 'u1', preferences: { briefingRoleFit: { account: true, follow_up: true } } }
      userPreferences.findOne.mockResolvedValue(existing)

      await service.setRoleFit('u1', 'follow_up', false)

      expect(userPreferences.save).toHaveBeenCalledWith({
        user_id: 'u1',
        preferences: { briefingRoleFit: { account: true } },
      })
    })

    it('`build()` lit le sac et le passe à `buildBriefingActions` — le rôle demandé pèse sur SES cartes', async () => {
      userPreferences.findOne.mockResolvedValue({
        user_id: 'u1',
        preferences: { briefingRoleFit: { need_stale: true } },
      })
      accounts.manager.query.mockResolvedValue([
        { id: 'need-1', title: 'Besoin ouvert', days: 9 },
        { id: 'need-2', title: 'Autre besoin', days: 6 },
      ])

      const briefing = await service.build('u1')

      const staleNeed = briefing.actions.find(action => action.kind === 'need_stale')
      expect(staleNeed?.rankingAxes.find(reading => reading.axis === 'roleFit')).toEqual({
        axis: 'roleFit',
        evaluated: true,
      })
    })

    it('une lecture des préférences en échec rend `{}` — le brief ne disparaît pas', async () => {
      userPreferences.findOne.mockRejectedValue(new Error('user_preferences indisponible'))

      const briefing = await service.build('u1')

      expect(briefing).toBeDefined()
    })
  })

  describe('#2099.17-.32 / #2099.52 — Reporter / Pas pertinent / Déjà traité', () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    it('POSE le geste dans le sac personnel, sans écraser les autres réglages', async () => {
      const existing = { user_id: 'u1', preferences: { tone: 'tutoiement', briefingRoleFit: { account: true } } }
      userPreferences.findOne.mockResolvedValue(existing)

      await service.setCardDisposition(
        'u1',
        { actionId: 'need:need-1', disposition: 'dismissed', reason: 'out_of_scope', factObservedAt: null },
        new Date('2026-09-28T09:00:00Z'),
      )

      expect(userPreferences.save).toHaveBeenCalledWith({
        user_id: 'u1',
        preferences: {
          tone: 'tutoiement',
          briefingRoleFit: { account: true },
          briefingCardDispositions: [
            {
              actionId: 'need:need-1',
              disposition: 'dismissed',
              reason: 'out_of_scope',
              until: null,
              factObservedAt: null,
              at: '2026-09-28T09:00:00.000Z',
            },
          ],
        },
      })
    })

    it('`build()` et `allActions()` ne rendent plus une carte reportée — les autres restent', async () => {
      const at = new Date().toISOString()
      userPreferences.findOne.mockResolvedValue({
        user_id: 'u1',
        preferences: {
          briefingCardDispositions: [
            {
              actionId: 'need:need-1',
              disposition: 'postponed',
              reason: null,
              until: new Date(Date.now() + 3600_000).toISOString(),
              factObservedAt: null,
              at,
            },
          ],
        },
      })
      accounts.manager.query.mockResolvedValue([
        { id: 'need-1', title: 'Besoin ouvert', days: 9 },
        { id: 'need-2', title: 'Autre besoin', days: 6 },
      ])

      const briefing = await service.build('u1')
      const ids = briefing.actions.map(action => action.id)
      expect(ids).not.toContain('need:need-1')
      expect(ids).toContain('need:need-2')

      const all = await service.allActions('u1')
      expect(all.map(action => action.id)).not.toContain('need:need-1')
    })

    /**
     * #3671.1 — recette prod 08/10 : clic réel sur « Donnée fausse » (carte de
     * conflit d'agenda) → AUCUN effet constaté (carte non retirée, revenue au
     * rechargement). Reproduit ici le geste COMPLET web → API → table : poser
     * le geste via `setCardDisposition`, puis rebâtir le brief à un instant
     * ULTÉRIEUR (comme le ferait le rafraîchissement déclenché par
     * `useSetCardDisposition`) — la carte doit rester absente.
     */
    it('« Donnée fausse » sur un conflit tient au rechargement suivant (#3671.1)', async () => {
      agenda.status.mockResolvedValue({
        connected: true,
        provider: 'google',
        capabilities: { read: true, write: true },
      })
      const event = (id: string, start: string, end: string) => ({
        id,
        summary: `Point ${id}`,
        description: null,
        location: null,
        start,
        end,
        organizer: 'moi@bellum.fr',
        attendees: [],
        conferenceUrl: null,
        webUrl: null,
        status: 'confirmed',
        isExternal: true,
        cancelled: false,
      })
      agenda.listEventsDetailed.mockResolvedValue({
        events: [
          event('a', '2026-09-28T09:00:00.000Z', '2026-09-28T10:00:00.000Z'),
          event('b', '2026-09-28T09:30:00.000Z', '2026-09-28T10:30:00.000Z'),
        ],
        unavailable: [],
      })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })

      const firstRead = new Date('2026-09-28T08:00:00.000Z')
      const before = await service.build('u1', firstRead)
      expect(before.actions.map(action => action.id)).toContain('conflict:a:b')
      const conflictCard = before.actions.find(action => action.id === 'conflict:a:b')

      let savedPreferences: { preferences: Record<string, unknown> } | null = null
      userPreferences.save.mockImplementation(async (value: { preferences: Record<string, unknown> }) => {
        savedPreferences = value
        return value
      })
      await service.setCardDisposition(
        'u1',
        {
          actionId: 'conflict:a:b',
          disposition: 'dismissed',
          reason: 'wrong_data',
          factObservedAt: conflictCard?.fact?.provenance.observedAt ?? null,
        },
        firstRead,
      )
      expect(savedPreferences).not.toBeNull()
      userPreferences.findOne.mockResolvedValue({ user_id: 'u1', preferences: savedPreferences!.preferences })

      // Le rechargement suivant : un instant PLUS TARD, comme le refetch que
      // `useSetCardDisposition` déclenche au succès de la mutation.
      const secondRead = new Date(firstRead.getTime() + 3600_000)
      const after = await service.build('u1', secondRead)
      expect(after.actions.map(action => action.id)).not.toContain('conflict:a:b')
    })
  })

  describe('#2770 (#2101.19/.21/.22/.30/.37/.40) — la porte d’écriture d’un créneau proposé', () => {
    const SLOT = { start: '2026-09-28T09:00:00.000Z', end: '2026-09-28T10:00:00.000Z', minutes: 60 }

    it('preview : un refus posé AUJOURD’HUI pour ce compte suspend tout calcul de créneau', async () => {
      const today = new Date().toISOString().slice(0, 10)
      userPreferences.findOne.mockResolvedValue({
        user_id: 'u1',
        preferences: { agendaSlotRejections: [{ accountId: 'acc-1', date: today }] },
      })

      const preview = await service.previewSlotProposal('u1', 'acc-1', 60)

      expect(preview).toEqual({ status: 'suppressed' })
      expect(agenda.freeSlots).not.toHaveBeenCalled()
    })

    it('preview : sans refus, rend le premier créneau libre et sa conséquence directe', async () => {
      userPreferences.findOne.mockResolvedValue(null)
      agenda.freeSlots.mockResolvedValue([SLOT])

      const preview = await service.previewSlotProposal('u1', 'acc-1', 60)

      expect(preview).toEqual({
        status: 'ready',
        slot: { start: SLOT.start, end: SLOT.end },
        consequence: { freeMinutesConsumed: 60 },
      })
    })

    it('preview : aucun créneau assez long dans la fenêtre — jamais un créneau deviné', async () => {
      userPreferences.findOne.mockResolvedValue(null)
      agenda.freeSlots.mockResolvedValue([])

      expect(await service.previewSlotProposal('u1', 'acc-1', 60)).toEqual({ status: 'no_slot' })
    })

    it('confirm : écrit EXACTEMENT le créneau reçu, préfixé du nom du compte RÉEL', async () => {
      accounts.findOne.mockResolvedValue({ id: 'acc-1', company_name: 'ACME' })
      agenda.createEvent.mockResolvedValue({ id: 'evt-1', webUrl: null, conferenceUrl: null, attendees: [] })

      const result = await service.confirmSlotProposal('u1', {
        accountId: 'acc-1',
        summary: 'Point commercial',
        start: SLOT.start,
        end: SLOT.end,
      })

      expect(agenda.createEvent).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          summary: 'Point commercial',
          accountName: 'ACME',
          startsAt: SLOT.start,
          endsAt: SLOT.end,
        }),
      )
      expect(result).toEqual({ id: 'evt-1', webUrl: null, conferenceUrl: null, attendees: [] })
    })

    it('confirm : pose le marqueur local #2101.19/.21/.22/.37 pour cet évènement', async () => {
      accounts.findOne.mockResolvedValue({ id: 'acc-1', company_name: 'ACME' })
      agenda.createEvent.mockResolvedValue({ id: 'evt-1', webUrl: null, conferenceUrl: null, attendees: [] })

      await service.confirmSlotProposal('u1', {
        accountId: 'acc-1',
        summary: 'Point commercial',
        start: SLOT.start,
        end: SLOT.end,
      })

      expect(bellumCreatedEvents.insert).toHaveBeenCalledWith({
        user_id: 'u1',
        account_id: 'acc-1',
        external_event_id: 'evt-1',
      })
    })

    it('confirm : un marqueur qui échoue ne fait PAS échouer la confirmation — l’agenda est déjà écrit', async () => {
      accounts.findOne.mockResolvedValue({ id: 'acc-1', company_name: 'ACME' })
      agenda.createEvent.mockResolvedValue({ id: 'evt-1', webUrl: null, conferenceUrl: null, attendees: [] })
      bellumCreatedEvents.insert.mockRejectedValue(new Error('duplicate key'))

      const result = await service.confirmSlotProposal('u1', {
        accountId: 'acc-1',
        summary: 'Point commercial',
        start: SLOT.start,
        end: SLOT.end,
      })

      expect(result).toEqual({ id: 'evt-1', webUrl: null, conferenceUrl: null, attendees: [] })
    })

    it('reject : mémorise le refus SANS jamais écrire dans l’agenda', async () => {
      userPreferences.findOne.mockResolvedValue(null)

      await service.rejectSlotProposal('u1', 'acc-1')

      expect(agenda.createEvent).not.toHaveBeenCalled()
      expect(userPreferences.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'u1',
          preferences: expect.objectContaining({
            agendaSlotRejections: [{ accountId: 'acc-1', date: expect.any(String) }],
          }),
        }),
      )
    })

    it('reject : fusionne avec un sac existant, sans écraser les autres réglages', async () => {
      userPreferences.findOne.mockResolvedValue({ user_id: 'u1', preferences: { tone: 'tutoiement' } })

      await service.rejectSlotProposal('u1', 'acc-1')

      expect(userPreferences.save).toHaveBeenCalledWith(
        expect.objectContaining({
          preferences: expect.objectContaining({ tone: 'tutoiement' }),
        }),
      )
    })
  })

  describe('#2770.49/.50/.51 — la porte d’écriture d’UN bloc de plan de journée', () => {
    it('écrit réellement le bloc dans l’agenda, sans compte', async () => {
      agenda.createEvent.mockResolvedValue({ id: 'evt-block-1', webUrl: null, conferenceUrl: null, attendees: [] })

      const result = await service.confirmFocusPlanBlock('u1', {
        title: 'Session d’appels — comptes prioritaires',
        start: '2026-09-29T09:00:00.000Z',
        end: '2026-09-29T09:30:00.000Z',
      })

      expect(agenda.createEvent).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          summary: 'Session d’appels — comptes prioritaires',
          startsAt: '2026-09-29T09:00:00.000Z',
          endsAt: '2026-09-29T09:30:00.000Z',
        }),
      )
      expect(result).toEqual({ id: 'evt-block-1', webUrl: null, conferenceUrl: null, attendees: [] })
    })

    it('normalise un horaire à décalage (jamais « Z ») en UTC, sans changer l’instant', async () => {
      agenda.createEvent.mockResolvedValue({ id: 'evt-block-2', webUrl: null, conferenceUrl: null, attendees: [] })

      await service.confirmFocusPlanBlock('u1', {
        title: 'Tâches administratives',
        start: '2026-09-29T11:00:00+02:00',
        end: '2026-09-29T11:30:00+02:00',
      })

      expect(agenda.createEvent).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          startsAt: '2026-09-29T09:00:00.000Z',
          endsAt: '2026-09-29T09:30:00.000Z',
        }),
      )
    })

    it('pose le marqueur local #2770.4/.5/.10 pour cet évènement, SANS compte', async () => {
      agenda.createEvent.mockResolvedValue({ id: 'evt-block-1', webUrl: null, conferenceUrl: null, attendees: [] })

      await service.confirmFocusPlanBlock('u1', {
        title: 'Session d’appels',
        start: '2026-09-29T09:00:00.000Z',
        end: '2026-09-29T09:30:00.000Z',
      })

      expect(bellumCreatedEvents.insert).toHaveBeenCalledWith({
        user_id: 'u1',
        account_id: null,
        external_event_id: 'evt-block-1',
      })
    })

    it('un marqueur qui échoue ne fait PAS échouer la confirmation — l’agenda est déjà écrit', async () => {
      agenda.createEvent.mockResolvedValue({ id: 'evt-block-1', webUrl: null, conferenceUrl: null, attendees: [] })
      bellumCreatedEvents.insert.mockRejectedValue(new Error('duplicate key'))

      const result = await service.confirmFocusPlanBlock('u1', {
        title: 'Session d’appels',
        start: '2026-09-29T09:00:00.000Z',
        end: '2026-09-29T09:30:00.000Z',
      })

      expect(result).toEqual({ id: 'evt-block-1', webUrl: null, conferenceUrl: null, attendees: [] })
    })
  })

  describe('#2770.52 — l’annulation d’un bloc réellement créé', () => {
    it('transmet à AgendaService.deleteEvent le seul identifiant que la confirmation a rendu', async () => {
      agenda.deleteEvent.mockResolvedValue(undefined)

      await service.cancelFocusPlanBlock('u1', 'evt-block-1')

      expect(agenda.deleteEvent).toHaveBeenCalledWith('u1', 'evt-block-1')
    })

    it('relaie une vraie panne plutôt que de l’avaler', async () => {
      agenda.deleteEvent.mockRejectedValue(new Error('agenda déconnecté'))

      await expect(service.cancelFocusPlanBlock('u1', 'evt-block-1')).rejects.toThrow('agenda déconnecté')
    })
  })

  describe('#2770.63/.64/.65 — la mesure post-bloc, un clic déclaré', () => {
    it.each(['realized', 'interrupted', 'postponed'] as const)(
      'pose l’état « %s » sur le seul identifiant que la confirmation a rendu',
      async outcome => {
        await service.setFocusPlanBlockOutcome('u1', 'evt-block-1', outcome)

        expect(focusPlanBlockOutcomes.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ user_id: 'u1', external_event_id: 'evt-block-1', outcome }),
          ['user_id', 'external_event_id'],
        )
      },
    )

    // #2770.66/.67 — déclarés, jamais mesurés ; un clic seul n'efface rien.
    it('pose le résultat libre et la durée déclarée quand la personne les donne', async () => {
      await service.setFocusPlanBlockOutcome('u1', 'evt-block-1', 'realized', {
        note: 'Deux rendez-vous obtenus',
        actualMinutes: 25,
      })
      expect(focusPlanBlockOutcomes.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ result_note: 'Deux rendez-vous obtenus', actual_minutes: 25 }),
        ['user_id', 'external_event_id'],
      )
    })

    it('un clic seul n’écrit NI note NI durée — il n’efface jamais ce qui avait été déclaré avant', async () => {
      await service.setFocusPlanBlockOutcome('u1', 'evt-block-1', 'interrupted')
      const written = focusPlanBlockOutcomes.upsert.mock.calls[0]?.[0] as Record<string, unknown>
      expect(written).not.toHaveProperty('result_note')
      expect(written).not.toHaveProperty('actual_minutes')
    })

    it('une correction gagne toujours — un second appel remplace le premier (upsert, jamais append-only)', async () => {
      await service.setFocusPlanBlockOutcome('u1', 'evt-block-1', 'interrupted')
      await service.setFocusPlanBlockOutcome('u1', 'evt-block-1', 'realized')

      expect(focusPlanBlockOutcomes.upsert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ outcome: 'realized' }),
        ['user_id', 'external_event_id'],
      )
    })
  })

  // #2391.54 / #2391.55 — ce que `setFocusPlanBlockOutcome` écrit se RELIT.
  describe('#2391.54 / #2391.55 — le résultat et la durée réelle d’un bloc, consultables', () => {
    it('rend la note et la durée déclarées, sur les seuls blocs de CETTE personne', async () => {
      focusPlanBlockOutcomes.find.mockResolvedValue([
        {
          external_event_id: 'evt-1',
          outcome: 'realized',
          result_note: 'Deux rendez-vous obtenus',
          actual_minutes: 25,
          updated_at: new Date('2026-10-31T10:00:00Z'),
        },
      ])
      const read = await service.listFocusPlanBlockOutcomes('u1', ['evt-1'])
      expect(focusPlanBlockOutcomes.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ user_id: 'u1' }) }),
      )
      expect(read).toEqual([
        {
          eventId: 'evt-1',
          outcome: 'realized',
          note: 'Deux rendez-vous obtenus',
          actualMinutes: 25,
          updatedAt: '2026-10-31T10:00:00.000Z',
        },
      ])
    })

    it('un clic seul se relit SANS note ni durée — « non déclaré » n’est jamais 0', async () => {
      focusPlanBlockOutcomes.find.mockResolvedValue([
        {
          external_event_id: 'evt-2',
          outcome: 'interrupted',
          result_note: null,
          actual_minutes: null,
          updated_at: new Date('2026-10-31T10:00:00Z'),
        },
      ])
      const [read] = await service.listFocusPlanBlockOutcomes('u1', ['evt-2'])
      expect(read).toMatchObject({ note: null, actualMinutes: null })
    })
  })

  describe('#2770 (#2101.14) — le classement par priorité, pour choisir à qui proposer', () => {
    it('rend les comptes par `priority_score` décroissant, tel que lu', async () => {
      userPreferences.findOne.mockResolvedValue(null)
      accounts.manager.query.mockResolvedValue([
        { id: 'acc-1', company_name: 'ACME', priority_score: 88 },
        { id: 'acc-2', company_name: 'Globex', priority_score: 42 },
      ])

      const ranked = await service.topAccountsForSlotProposal('u1')

      expect(ranked).toEqual([
        { accountId: 'acc-1', companyName: 'ACME', priorityScore: 88 },
        { accountId: 'acc-2', companyName: 'Globex', priorityScore: 42 },
      ])
      expect(accounts.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('priority_score IS NOT NULL'),
        expect.arrayContaining(['ws1']),
      )
    })

    it('exclut un compte refusé AUJOURD’HUI — même mémoire que `previewSlotProposal`', async () => {
      const today = new Date().toISOString().slice(0, 10)
      userPreferences.findOne.mockResolvedValue({
        user_id: 'u1',
        preferences: { agendaSlotRejections: [{ accountId: 'acc-1', date: today }] },
      })
      accounts.manager.query.mockResolvedValue([
        { id: 'acc-1', company_name: 'ACME', priority_score: 88 },
        { id: 'acc-2', company_name: 'Globex', priority_score: 42 },
      ])

      const ranked = await service.topAccountsForSlotProposal('u1')

      expect(ranked).toEqual([{ accountId: 'acc-2', companyName: 'Globex', priorityScore: 42 }])
    })

    it('borne au `limit` demandé, même avec davantage de comptes lus', async () => {
      userPreferences.findOne.mockResolvedValue(null)
      accounts.manager.query.mockResolvedValue([
        { id: 'acc-1', company_name: 'ACME', priority_score: 90 },
        { id: 'acc-2', company_name: 'Globex', priority_score: 80 },
        { id: 'acc-3', company_name: 'Initech', priority_score: 70 },
      ])

      const ranked = await service.topAccountsForSlotProposal('u1', 2)

      expect(ranked).toHaveLength(2)
      expect(ranked.map(a => a.accountId)).toEqual(['acc-1', 'acc-2'])
    })

    it('portefeuille RESTREINT : ajoute la clause `assigned_to`, même règle que `/accounts`', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws1', role: 'sales' })
      workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
      userPreferences.findOne.mockResolvedValue(null)
      accounts.manager.query.mockResolvedValue([])

      await service.topAccountsForSlotProposal('u1')

      expect(accounts.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('assigned_to'),
        expect.arrayContaining(['ws1', 'u1']),
      )
    })
  })

  describe('#2770 (#2101.19/.21/.22/.37) — les identifiants croisés par la grille/le plateau', () => {
    it('rend les identifiants réellement enregistrés pour CET utilisateur', async () => {
      bellumCreatedEvents.find.mockResolvedValue([{ external_event_id: 'evt-1' }, { external_event_id: 'evt-2' }])

      const ids = await service.listBellumCreatedEventIds('u1')

      expect(ids).toEqual(['evt-1', 'evt-2'])
      expect(bellumCreatedEvents.find).toHaveBeenCalledWith({
        where: { user_id: 'u1' },
        select: ['external_event_id'],
      })
    })

    it('salle de démonstration : rend le seul évènement démo écrit par cette porte, jamais une vraie ligne', async () => {
      workspaceContext.isDemoWorkspace.mockResolvedValue(true)

      const ids = await service.listBellumCreatedEventIds('demo-u1')

      expect(ids).toEqual(['demo-event-nova-creneau-propose'])
      expect(bellumCreatedEvents.find).not.toHaveBeenCalled()
    })
  })

  describe('protectedTime (#2101.13) — LE TEMPS PROTÉGÉ, réglé par la personne', () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    it('`build()` rend `null` tant que rien n’a été réglé — jamais une fenêtre devinée', async () => {
      userPreferences.findOne.mockResolvedValue(null)

      const briefing = await service.build('u1')

      expect(briefing.protectedTime).toBeNull()
    })

    it('`build()` lit la fenêtre posée dans le MÊME sac que `briefingRoleFit`', async () => {
      userPreferences.findOne.mockResolvedValue({
        user_id: 'u1',
        preferences: { protectedTime: { startMinute: 540, endMinute: 1080 } },
      })

      const briefing = await service.build('u1')

      expect(briefing.protectedTime).toEqual({ startMinute: 540, endMinute: 1080 })
    })

    it('une valeur corrompue (posée avant la validation) rend `null`, jamais une fenêtre à moitié lue', async () => {
      userPreferences.findOne.mockResolvedValue({
        user_id: 'u1',
        preferences: { protectedTime: { startMinute: 'neuf', endMinute: 1080 } },
      })

      const briefing = await service.build('u1')

      expect(briefing.protectedTime).toBeNull()
    })

    it('une lecture des préférences en échec rend `null` — le brief ne casse pas', async () => {
      userPreferences.findOne.mockRejectedValue(new Error('user_preferences indisponible'))

      const briefing = await service.build('u1')

      expect(briefing.protectedTime).toBeNull()
    })
  })

  describe('workdayWindowOf (#2770.27) — les heures de travail du plan de Laura', () => {
    it('le temps protégé réglé devient les heures ouvrées', async () => {
      userPreferences.findOne.mockResolvedValue({
        user_id: 'u1',
        preferences: { protectedTime: { startMinute: 570, endMinute: 1050 } },
      })

      await expect(service.workdayWindowOf('u1')).resolves.toEqual({ workdayStartHour: 10, workdayEndHour: 17 })
    })

    it('aucun réglage ou lecture en échec : null, jamais une fenêtre devinée', async () => {
      userPreferences.findOne.mockResolvedValue(null)
      await expect(service.workdayWindowOf('u1')).resolves.toBeNull()

      userPreferences.findOne.mockRejectedValue(new Error('user_preferences indisponible'))
      await expect(service.workdayWindowOf('u1')).resolves.toBeNull()
    })
  })

  describe('agendaPreferencesOf (#2770.28) — les préférences d’agenda pour le plan de Laura', () => {
    it('les deux champs réglés sont restitués tels quels', async () => {
      userPreferences.findOne.mockResolvedValue({
        user_id: 'u1',
        preferences: { agendaPreferences: { dossierDurationMinutes: 30, reserveSlots: 2 } },
      })

      await expect(service.agendaPreferencesOf('u1')).resolves.toEqual({ dossierDurationMinutes: 30, reserveSlots: 2 })
    })

    it('aucun réglage ou lecture en échec : `{}`, jamais une préférence devinée', async () => {
      userPreferences.findOne.mockResolvedValue(null)
      await expect(service.agendaPreferencesOf('u1')).resolves.toEqual({})

      userPreferences.findOne.mockRejectedValue(new Error('user_preferences indisponible'))
      await expect(service.agendaPreferencesOf('u1')).resolves.toEqual({})
    })
  })

  describe('agendaPreferences (#2101.17) — LES PRÉFÉRENCES D’AGENDA, au-delà du seul temps protégé', () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    it('`build()` rend `{}` tant que rien n’a été réglé — jamais une valeur devinée', async () => {
      userPreferences.findOne.mockResolvedValue(null)

      const briefing = await service.build('u1')

      expect(briefing.agendaPreferences).toEqual({})
    })

    it('`build()` lit les deux champs posés dans le MÊME sac que `protectedTime`', async () => {
      userPreferences.findOne.mockResolvedValue({
        user_id: 'u1',
        preferences: { agendaPreferences: { dossierDurationMinutes: 30, reserveSlots: 2 } },
      })

      const briefing = await service.build('u1')

      expect(briefing.agendaPreferences).toEqual({ dossierDurationMinutes: 30, reserveSlots: 2 })
    })

    it('un champ invalide (posé avant la validation) reste ABSENT, sans effacer l’autre', async () => {
      userPreferences.findOne.mockResolvedValue({
        user_id: 'u1',
        preferences: { agendaPreferences: { dossierDurationMinutes: 'trente', reserveSlots: 2 } },
      })

      const briefing = await service.build('u1')

      expect(briefing.agendaPreferences).toEqual({ reserveSlots: 2 })
    })

    it('une lecture des préférences en échec rend `{}` — le brief ne casse pas', async () => {
      userPreferences.findOne.mockRejectedValue(new Error('user_preferences indisponible'))

      const briefing = await service.build('u1')

      expect(briefing.agendaPreferences).toEqual({})
    })
  })

  /**
   * #2107.8 — RECETTE ÉCRAN du 25/09/2026 (prod `1371ef9d38`) : une mission
   * `status = 'onboarding', ends_on = null` existait réellement dans l'espace
   * recetté, sans qu'aucune carte `mission_no_end_date` n'apparaisse sur
   * `/briefing/today`. Ce test reproduit EXACTEMENT cette forme de donnée —
   * s'il échoue, le producteur ne matche pas ; s'il passe (il passe), seule
   * l'éviction par `BRIEFING_ACTIONS_MAX` (couverte plus bas par
   * `allActions()`) expliquait l'absence en recette.
   */
  describe('missions sans date de fin (#2107.8)', () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    it('mission status=onboarding, ends_on=null — ouvre la fiche de la mission', async () => {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('ends_on IS NULL')) return Promise.resolve([{ id: 'm-9', label: 'Support N2' }])
        return Promise.resolve([])
      })

      const briefing = await service.build('u1')

      expect(briefing.actions).toContainEqual(
        expect.objectContaining({ id: 'mission-no-end-date:m-9', kind: 'mission_no_end_date', href: '/missions/m-9' }),
      )
    })
  })

  /**
   * #2107.14 — RECETTE ÉCRAN du 25/09/2026 : un AO `status = 'analysed'`
   * portant 6 exigences `weight: 'mandatory', answer_status: 'to_produce'`
   * existait réellement, sans carte `rfp_requirement_gap`. Même vérification
   * que ci-dessus : le producteur matche déjà cette forme exacte.
   */
  /**
   * L1 (31/10/2026) — LE MOTEUR DE CARTES BRANCHÉ : chaque lecture neuve
   * atteint l'appelant réel (`build`), et chacune reste sous le périmètre de
   * portefeuille de l'appelant (#2107.48).
   */
  describe('L1 — moteur de cartes : les lectures atteignent le brief', () => {
    beforeEach(() => {
      contacts.manager.query.mockResolvedValue([])
      contacts.find.mockResolvedValue([])
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    function rowsFor(table: Array<[string, unknown[]]>) {
      return (sql: string) => Promise.resolve(table.find(([fragment]) => sql.includes(fragment))?.[1] ?? [])
    }

    it('#2095.45 — une mission qui démarre et un avenant envoyé produisent leurs cartes', async () => {
      accounts.manager.query.mockImplementation(
        rowsFor([
          ['m.started_on BETWEEN', [{ id: 'm-4', label: 'Data Orange', days_until_start: 3, starts_on: '2026-11-03' }]],
          ['FROM mission_documents d', [{ mission_id: 'm-5', label: 'Run Total', name: 'Avenant 2', days: 12 }]],
        ]),
      )
      const briefing = await service.build('u1')
      expect(briefing.actions).toContainEqual(
        expect.objectContaining({ id: 'mission-starting:m-4', kind: 'mission_starting', href: '/missions/m-4' }),
      )
      expect(briefing.actions).toContainEqual(
        expect.objectContaining({ id: 'mission-amendment:m-5:Avenant 2', kind: 'mission_amendment_pending' }),
      )
    })

    it('#2095.41 — un contact passé historique produit sa carte, datée de sa transition', async () => {
      contacts.find.mockResolvedValue([{ id: 'c-7', full_name: 'Lucie Bernard', account_id: 'a-1' }])
      accounts.find.mockResolvedValue([{ id: 'a-1', company_name: 'Thales', assigned_to: null }])
      accounts.manager.query.mockImplementation(
        rowsFor([['FROM contact_lifecycle_transitions', [{ contact_id: 'c-7', occurred_at: '2026-10-29T10:00:00Z' }]]]),
      )
      const briefing = await service.build('u1')
      expect(briefing.actions).toContainEqual(
        expect.objectContaining({
          id: 'contact-left:c-7',
          kind: 'contact_left',
          labelVars: { name: 'Lucie Bernard', company: 'Thales' },
        }),
      )
    })

    it('#2095.41 — périmètre : le contact d’un compte porté par un AUTRE commercial ne fait pas de carte', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws1', role: 'sales' })
      workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
      contacts.find.mockResolvedValue([{ id: 'c-7', full_name: 'Lucie Bernard', account_id: 'a-1' }])
      accounts.find.mockResolvedValue([{ id: 'a-1', company_name: 'Thales', assigned_to: 'someone-else' }])
      accounts.manager.query.mockImplementation(
        rowsFor([['FROM contact_lifecycle_transitions', [{ contact_id: 'c-7', occurred_at: '2026-10-29T10:00:00Z' }]]]),
      )
      const briefing = await service.build('u1')
      expect(briefing.actions.some(action => action.kind === 'contact_left')).toBe(false)
    })

    it('#2095.10 — une mission sans consultant et un interlocuteur de facturation sans e-mail', async () => {
      accounts.manager.query.mockImplementation(
        rowsFor([
          ['FROM mission_assignments ma', [{ id: 'm-2', label: 'Audit BPCE' }]],
          ['m.billing_contact_id IS NOT NULL', [{ billing_contact_id: 'c-3' }]],
        ]),
      )
      contacts.find.mockImplementation(({ where }: { where: { lifecycle_state?: string } }) =>
        Promise.resolve(where.lifecycle_state ? [] : [{ id: 'c-3', full_name: 'Paul Durand', email: null }]),
      )
      const briefing = await service.build('u1')
      const ids = briefing.actions.map(action => action.id)
      expect(ids).toContain('critical-data:mission_consultant:m-2')
      expect(ids).toContain('critical-data:billing_contact_email:c-3')
    })

    it('#2095.10 — un interlocuteur qui A un e-mail ne fait pas de carte', async () => {
      accounts.manager.query.mockImplementation(
        rowsFor([['m.billing_contact_id IS NOT NULL', [{ billing_contact_id: 'c-3' }]]]),
      )
      contacts.find.mockImplementation(({ where }: { where: { lifecycle_state?: string } }) =>
        Promise.resolve(
          where.lifecycle_state ? [] : [{ id: 'c-3', full_name: 'Paul Durand', email: 'paul@client.fr' }],
        ),
      )
      const briefing = await service.build('u1')
      expect(briefing.actions.some(action => action.kind === 'critical_data_missing')).toBe(false)
    })

    it('#2107.15 — un CRM dont le jeton ne se rafraîchit plus produit « à reconnecter »', async () => {
      accounts.manager.query.mockImplementation(rowsFor([['FROM crm_connections', [{ provider: 'hubspot' }]]]))
      const briefing = await service.build('u1')
      expect(briefing.actions).toContainEqual(
        expect.objectContaining({ id: 'connector-broken:crm', labelKey: 'briefing.actions.connectorBrokenCrm' }),
      )
    })

    it('une lecture en échec rend le brief quand même, sans la carte', async () => {
      accounts.manager.query.mockImplementation((sql: string) =>
        sql.includes('m.started_on BETWEEN') ? Promise.reject(new Error('missions indisponible')) : Promise.resolve([]),
      )
      const briefing = await service.build('u1')
      expect(briefing.actions.some(action => action.kind === 'mission_starting')).toBe(false)
    })

    // Droits — un commercial d'un espace CLOISONNÉ ne reçoit pas les cartes
    // hors de son portefeuille : chaque lecture neuve (et le rebond, qui
    // l'oubliait) porte la clause « à moi ou à personne », avec SON identifiant.
    it('périmètre : chaque lecture neuve est bornée au portefeuille du commercial', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws1', role: 'sales' })
      workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
      await service.build('u1')
      const calls = accounts.manager.query.mock.calls as Array<[string, unknown[]]>
      for (const fragment of [
        'm.started_on BETWEEN',
        'FROM mission_documents d',
        'FROM mission_assignments ma',
        'm.billing_contact_id IS NOT NULL',
      ]) {
        const call = calls.find(([sql]) => sql.includes(fragment))
        expect(call?.[0]).toContain('assigned_to = $')
        expect(call?.[1]).toContain('u1')
      }
      const bounced = (contacts.manager.query.mock.calls as Array<[string, unknown[]]>).find(([sql]) =>
        sql.includes('email_bounced_at IS NOT NULL'),
      )
      expect(bounced?.[0]).toContain('assigned_to = $')
      expect(bounced?.[1]).toContain('u1')
    })

    it('périmètre ouvert : aucune clause ajoutée — même requête qu’avant', async () => {
      await service.build('u1')
      const calls = accounts.manager.query.mock.calls as Array<[string, unknown[]]>
      const starting = calls.find(([sql]) => sql.includes('m.started_on BETWEEN'))
      expect(starting?.[0]).not.toContain('assigned_to = $')
    })
  })

  describe('exigences AO non couvertes (#2107.14)', () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    it('AO status=analysed, 6 exigences mandatory/to_produce — la carte compte les 6', async () => {
      const requirement = (id: string) => ({
        id,
        rfp_id: 'rfp-1',
        section: null,
        text: 'Exigence',
        weight: 'mandatory',
        kind: 'technical',
        owner_role: 'expert',
        answer_status: 'to_produce',
        answer_source: null,
        answer_text: null,
        risk: null,
      })
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('r.requirements')) {
          return Promise.resolve([
            {
              id: 'rfp-1',
              title: 'Refonte SI RH',
              requirements: Array.from({ length: 6 }, (_, i) => requirement(`req-${i}`)),
            },
          ])
        }
        return Promise.resolve([])
      })

      const briefing = await service.build('u1')

      expect(briefing.actions).toContainEqual(
        expect.objectContaining({ id: 'rfp-requirement-gap:rfp-1', kind: 'rfp_requirement_gap' }),
      )
    })
  })

  /**
   * #2107.4 — RECETTE ÉCRAN du 25/09/2026 : l'API renvoyait `substatus: null`
   * sur des candidatures RÉELLEMENT soumises (`stage: 'submitted'`) — le
   * prédicat `substatus = 'presented'` ne matchait donc jamais. Corrigé pour
   * lire `stage = 'submitted'`, la colonne D'ORIGINE jamais nulle (voir le
   * docblock de `BriefingService.buildSubmissionsWithoutResponse`).
   */
  describe('profils envoyés sans retour (#2107.4) — correctif de lecture inerte', () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    function mockSubmissionsQuery(rows: unknown[]) {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM submissions')) return Promise.resolve(rows)
        return Promise.resolve([])
      })
    }

    it("le prédicat lit `stage = 'submitted'`, jamais `substatus`", async () => {
      mockSubmissionsQuery([])

      await service.build('u1')

      const call = accounts.manager.query.mock.calls.find(([sql]: [string]) => sql.includes('FROM submissions'))
      expect(call?.[0]).toContain("s.stage = 'submitted'")
      expect(call?.[0]).not.toMatch(/substatus/)
    })

    it('ouvre la fiche du consultant sans retour dans les actions du jour', async () => {
      mockSubmissionsQuery([{ consultant_id: 'c-1', consultant_name: 'Yanis Berthier', days: 9 }])

      const briefing = await service.build('u1')

      expect(briefing.actions).toContainEqual(
        expect.objectContaining({
          id: 'submission-no-response:c-1',
          kind: 'submission_no_response',
          href: '/consultants/c-1',
        }),
      )
    })

    // #2387.7 (épopée #2767) — la MÊME lecture atteint le payload de l'écran.
    it('expose le profil sans retour à l’écran « en attente des autres », avec son ancienneté réelle', async () => {
      mockSubmissionsQuery([{ consultant_id: 'c-1', consultant_name: 'Yanis Berthier', days: 9 }])

      const briefing = await service.build('u1')

      expect(briefing.awaitingClientProfiles).toEqual([
        { consultantId: 'c-1', consultantName: 'Yanis Berthier', days: 9 },
      ])
    })

    // R22 /briefing — « Profils envoyés » listait le MÊME profil deux fois (deux positionnements du même consultant).
    it('un consultant positionné deux fois ne fait qu’UNE ligne, au plus ancien envoi', async () => {
      mockSubmissionsQuery([
        { consultant_id: 'c-1', consultant_name: 'Yanis Berthier', days: 9 },
        { consultant_id: 'c-1', consultant_name: 'Yanis Berthier', days: 12 },
        { consultant_id: 'c-2', consultant_name: 'Lina Morel', days: 8 },
      ])

      const briefing = await service.build('u1')

      expect(briefing.awaitingClientProfiles).toEqual([
        { consultantId: 'c-1', consultantName: 'Yanis Berthier', days: 12 },
        { consultantId: 'c-2', consultantName: 'Lina Morel', days: 8 },
      ])
      expect(briefing.actions.filter(action => action.id === 'submission-no-response:c-1')).toHaveLength(1)
    })

    it('la requête dédoublonne dès la base — la limite de 20 ne compte pas deux fois le même profil', async () => {
      mockSubmissionsQuery([])
      await service.build('u1')
      const call = accounts.manager.query.mock.calls.find(([sql]: [string]) => sql.includes('FROM submissions'))
      expect(call?.[0]).toMatch(/DISTINCT ON \(s\.consultant_id\)/)
    })

    it('sans profil en attente, la liste est vide — aucune ligne à l’écran', async () => {
      mockSubmissionsQuery([])

      const briefing = await service.build('u1')

      expect(briefing.awaitingClientProfiles).toEqual([])
    })

    it('sans profil en attente, absent des actions du jour', async () => {
      mockSubmissionsQuery([])

      const briefing = await service.build('u1')

      expect(briefing.actions.some(action => action.kind === 'submission_no_response')).toBe(false)
    })
  })

  /**
   * #2107.9 / #2107.11 / #2107.16 — LE CRA MANQUANT, LA FACTURE PRÊTE, ET LA
   * DONNÉE BLOQUANTE — trois cartes nées de la même lecture bornée aux
   * missions ACTIVES de l'appelant (`buildTimesheetLine` +
   * `assessInvoiceReadiness`, réutilisées telles quelles).
   */
  describe('CRA manquant, facture prête, donnée bloquante (#2107.9 / #2107.11 / #2107.16)', () => {
    const NOW = new Date('2026-09-25T10:00:00.000Z')

    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    function mockInvoicingQuery(rows: unknown[]) {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('mission_commercial_terms')) return Promise.resolve(rows)
        return Promise.resolve([])
      })
    }

    it('un CRA manquant (aucun relevé, mois précédent déjà clos) ouvre la mission dans les actions du jour', async () => {
      mockInvoicingQuery([
        {
          id: 'mission-cra',
          label: 'Migration cloud',
          contract_kind: 'regie',
          started_on: '2026-01-01',
          ends_on: null,
          daily_rate: '600',
          billing_contact_id: 'contact-1',
          requires_po: false,
          po_number: null,
          billing_cadence: 'monthly',
          loaded_daily_cost_cents: '30000',
          po_valid_until: null,
          ts_id: null,
          ts_status: null,
          ts_days: null,
          ts_expected: null,
          ts_explanation: null,
          ts_anomalies: null,
          na_id: null,
          na_reason: null,
          na_created_at: null,
        },
      ])

      const briefing = await service.build('u1', NOW)

      expect(briefing.actions).toContainEqual(
        expect.objectContaining({ id: 'cra-missing:mission-cra', kind: 'cra_missing', href: '/missions/mission-cra' }),
      )
      // #2107.16 — un CRA manquant a déjà SA carte : jamais une seconde sous
      // « donnée bloquante » pour la même mission.
      expect(briefing.actions.some(action => action.kind === 'invoicing_blocked_missing_data')).toBe(false)
    })

    // #2567 — « CRA à relancer » pour le back-office : un rôle qui tient la facturation
    // (`finance:write`) voit les CRA manquants de TOUTE l'espace, pas seulement des
    // missions dont il est propriétaire — sur un espace où personne ne porte les
    // missions, le brief du matin restait muet sur dix CRA manquants.
    it('un rôle de facturation lit les CRA manquants de l’ESPACE, un commercial seulement les siens', async () => {
      const seen: string[] = []
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('mission_commercial_terms')) seen.push(sql)
        return Promise.resolve([])
      })
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws1', role: 'owner' })
      await service.build('u1', NOW)
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws1', role: 'member' })
      await service.build('u2', NOW)
      expect(seen.length).toBeGreaterThanOrEqual(2)
      expect(seen[0]).not.toContain('owner_id =')
      expect(seen[seen.length - 1]).toContain('owner_id =')
    })

    it('aucun bloqueur restant : le mois est PRÊT à facturer', async () => {
      mockInvoicingQuery([
        {
          id: 'mission-ready',
          label: 'Audit sécurité',
          contract_kind: 'regie',
          started_on: '2026-01-01',
          ends_on: null,
          daily_rate: '600',
          billing_contact_id: 'contact-1',
          requires_po: false,
          po_number: null,
          billing_cadence: 'monthly',
          loaded_daily_cost_cents: '30000',
          po_valid_until: null,
          ts_id: 'ts-1',
          ts_status: 'validated',
          ts_days: '20',
          ts_expected: '20',
          ts_explanation: null,
          ts_anomalies: [],
          na_id: null,
          na_reason: null,
          na_created_at: null,
        },
      ])

      const briefing = await service.build('u1', NOW)

      expect(briefing.actions).toContainEqual(
        expect.objectContaining({ id: 'invoice-ready:mission-ready', kind: 'invoice_ready' }),
      )
    })

    it('aucun TJM renseigné : la carte NOMME la donnée manquante et ouvre la mission', async () => {
      mockInvoicingQuery([
        {
          id: 'mission-blocked',
          label: 'Refonte SI RH',
          contract_kind: 'regie',
          started_on: '2026-01-01',
          ends_on: null,
          daily_rate: null,
          billing_contact_id: 'contact-1',
          requires_po: false,
          po_number: null,
          billing_cadence: 'monthly',
          loaded_daily_cost_cents: '30000',
          po_valid_until: null,
          ts_id: 'ts-1',
          ts_status: 'validated',
          ts_days: '20',
          ts_expected: '20',
          ts_explanation: null,
          ts_anomalies: [],
          na_id: null,
          na_reason: null,
          na_created_at: null,
        },
      ])

      const briefing = await service.build('u1', NOW)

      expect(briefing.actions).toContainEqual(
        expect.objectContaining({
          id: 'invoicing-blocked:mission-blocked',
          kind: 'invoicing_blocked_missing_data',
          labelKey: 'briefing.actions.invoicingBlockedMissingRate',
        }),
      )
    })

    it('une lecture SQL en échec rend les trois listes vides — le brief ne disparaît pas', async () => {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('mission_commercial_terms')) return Promise.reject(new Error('illisible'))
        return Promise.resolve([])
      })

      const briefing = await service.build('u1', NOW)

      expect(briefing.actions.some(action => action.kind === 'cra_missing')).toBe(false)
      expect(briefing.actions.some(action => action.kind === 'invoice_ready')).toBe(false)
      expect(briefing.actions.some(action => action.kind === 'invoicing_blocked_missing_data')).toBe(false)
    })

    it('borne la lecture aux missions ACTIVES DE L’APPELANT, toujours — même sur un espace ouvert', async () => {
      workspaceContext.portfolioVisibilityOf.mockResolvedValue('open')
      mockInvoicingQuery([])

      await service.build('u1', NOW)

      const call = (accounts.manager.query.mock.calls as [string, unknown[]][]).find(([sql]) =>
        sql.includes('mission_commercial_terms'),
      )
      expect(call?.[0]).toContain("m.status = 'active'")
      expect(call?.[0]).toContain('assigned_to = $')
      expect(call?.[1]).toContain('u1')
    })
  })

  /**
   * #2107.48 — LA VISIBILITÉ DE PORTEFEUILLE, APPLIQUÉE À `/briefing`.
   *
   * Mesuré le 25/09/2026 : les producteurs de ce service ne filtraient QUE par
   * `workspace_id` — sur un espace cloisonné, un commercial sans `team:manage`
   * voyait donc les missions, besoins et AO de TOUTE l'équipe dans SON brief
   * personnel. Preuve par le SQL envoyé (comme `project-pipeline.service.spec.ts`
   * le fait déjà pour le pipe) : sur un espace `restricted` et un rôle sans
   * `team:manage`, chaque producteur touché ajoute la clause « le mien, ou
   * personne » (`financeScopeClause`), liée à L'IDENTIFIANT DE L'APPELANT —
   * c'est cette clause qui, en base réelle, retire du résultat un compte hors
   * périmètre : aucune carte n'en sort jamais.
   */
  describe('la visibilité de portefeuille (#2107.48)', () => {
    beforeEach(() => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws1', role: 'sales' })
      workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    // #2107.9/#2107.11/#2107.16 — `buildInvoicingCards` (CRA manquant, facture
    // prête, donnée bloquante) est TOUJOURS scopé « le mien », quel que soit le
    // réglage de portefeuille (voir son docblock) : sa clause `assigned_to`
    // reste présente même sur un espace OUVERT, et les deux preuves ci-dessous
    // l'excluent donc explicitement — ce n'est pas la règle #2107.48 qu'elles
    // vérifient.
    const isInvoicingCardsQuery = (sql: string) => sql.includes('mission_commercial_terms')

    it('un espace OUVERT (le défaut) n’ajoute AUCUNE clause de périmètre — même SQL qu’avant', async () => {
      workspaceContext.portfolioVisibilityOf.mockResolvedValue('open')

      await service.build('u1')

      for (const [sql] of accounts.manager.query.mock.calls as [string][]) {
        if (isInvoicingCardsQuery(sql)) continue
        expect(sql).not.toContain('assigned_to = $')
      }
    })

    it('un `team:manage` voit tout l’espace même sur un portefeuille cloisonné', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws1', role: 'owner' })

      await service.build('u1')

      for (const [sql] of accounts.manager.query.mock.calls as [string][]) {
        if (isInvoicingCardsQuery(sql)) continue
        expect(sql).not.toContain('assigned_to = $')
      }
    })

    it('un membre cloisonné sans `team:manage` restreint besoins/missions/AO à SON portefeuille', async () => {
      await service.build('u1')

      const calls = accounts.manager.query.mock.calls as [string, unknown[]][]
      const scoped = calls.filter(([sql]) => sql.includes('assigned_to = $'))

      // Les huit producteurs touchés par #2107.48 (besoins, quatre lectures de
      // missions, deux d'AO) ajoutent tous la MÊME clause, liée à l'appelant.
      expect(scoped.length).toBeGreaterThanOrEqual(6)
      for (const [sql, params] of scoped) {
        expect(sql).toContain('assigned_to = $')
        expect(params).toContain('u1')
      }

      // Un besoin (`project_needs`) et une mission (`missions`) portent leur
      // propre owner : « je le porte » OU « le compte m'est attribué ».
      expect(scoped.some(([sql]) => sql.includes('n.owner_id'))).toBe(true)
      expect(scoped.some(([sql]) => sql.includes('m.owner_id'))).toBe(true)
      // Un appel d'offres (`rfps`) ne porte PAS d'owner : seul le compte
      // rattaché compte, et l'absence de compte reste visible de tous.
      expect(scoped.some(([sql]) => sql.includes('r.account_id IS NULL'))).toBe(true)
    })
  })

  /**
   * #2107 (Centre d'actions) — `allActions()` rend l'ENSEMBLE des candidats,
   * jamais plafonné à `BRIEFING_ACTIONS_MAX` : c'est la lecture que `/actions`
   * utilise pour ne plus jamais perdre un genre de priorité basse au plafond
   * du brief (mesuré en recette #2107.4/#2107.8/#2107.14, 25/09/2026 —
   * 4 `payment_overdue` + 1 `mission_end` + 2 e-mails suffisaient à évincer).
   */
  describe('allActions() — Centre d’actions, jamais plafonné (#2107)', () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    it('rend plus que BRIEFING_ACTIONS_MAX quand plus de candidats existent que de places', async () => {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM submissions')) {
          return Promise.resolve(
            Array.from({ length: 12 }, (_, i) => ({
              consultant_id: `c-${i}`,
              consultant_name: `Consultant ${i}`,
              days: 9 + i,
            })),
          )
        }
        return Promise.resolve([])
      })

      const capped = await service.build('u1')
      const all = await service.allActions('u1')

      expect(capped.actions.length).toBeLessThanOrEqual(7)
      expect(all.length).toBeGreaterThan(capped.actions.length)
      expect(all.filter(action => action.kind === 'submission_no_response')).toHaveLength(12)
    })

    it('salle de démonstration : même ensemble non plafonné, jamais un connecteur cassé (#2107.15)', async () => {
      workspaceContext.isDemoWorkspace.mockResolvedValue(true)
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-demo', role: 'commercial' })
      accounts.find.mockResolvedValue([])

      const all = await service.allActions('u1')

      expect(Array.isArray(all)).toBe(true)
      expect(all.some(action => action.kind === 'connector_broken')).toBe(false)
    })

    // #2105.53 (correctif) — la carte est retirée à la SOURCE une fois la
    // tâche créée, plutôt que seulement annotée « déjà transformée » côté
    // client (`briefingActionHasOpenTask`, apps/web) : sans ce retrait, elle
    // restait affichée À CÔTÉ de la tâche qu'elle a produite.
    describe('retire une carte déjà transformée en tâche (#2105.53, correctif)', () => {
      const openAccountNoOwnerTask = (overrides: {
        accountId: string | null
        sourceLabelKey: string | null
        dueOn?: string
      }) => ({
        id: 't1',
        title: 'x',
        details: null,
        status: 'todo' as const,
        priority: 'normal' as const,
        dueOn: overrides.dueOn ?? '2026-09-26',
        source: 'manual' as const,
        type: 'linked' as const,
        relatedActionRunId: null,
        ownerId: null,
        ownerName: null,
        createdById: null,
        createdByName: null,
        expectedResult: null,
        accountId: overrides.accountId,
        accountName: null,
        contactId: null,
        contactName: null,
        projectId: null,
        projectLabel: null,
        completedAt: null,
        completedById: null,
        completedByName: null,
        resultNote: null,
        createdAt: '2026-09-20T08:00:00.000Z',
        updatedAt: '2026-09-20T08:00:00.000Z',
        sourceLabelKey: overrides.sourceLabelKey,
      })

      // Module DÉDIÉ, avec `TasksService` fourni : le module partagé du fichier
      // en fait volontairement l'économie (voir « reste `null` pour une source
      // non lue » plus haut, qui vérifie l'inverse — la capacité désactivée).
      let serviceWithTasks: BriefingService

      beforeEach(async () => {
        accounts.manager.query.mockImplementation((sql: string) => {
          if (sql.includes('FROM accounts') && sql.includes('assigned_to IS NULL')) {
            return Promise.resolve([{ id: 'acc-1', company_name: 'ACME' }])
          }
          return Promise.resolve([])
        })

        const moduleRef = await Test.createTestingModule({
          providers: [
            BriefingService,
            { provide: AgendaService, useValue: agenda },
            { provide: MailboxService, useValue: mailbox },
            { provide: SignalHistoryService, useValue: signalHistory },
            { provide: WorkspaceContextService, useValue: workspaceContext },
            { provide: getRepositoryToken(AccountEntity), useValue: accounts },
            { provide: getRepositoryToken(ActivityEntity), useValue: activities },
            { provide: getRepositoryToken(ContactEntity), useValue: contacts },
            { provide: getRepositoryToken(InterventionEntity), useValue: interventions },
            { provide: getRepositoryToken(ProfileEntity), useValue: profiles },
            { provide: getRepositoryToken(UserPreferenceEntity), useValue: userPreferences },
            { provide: getRepositoryToken(AttackAngleEntity), useValue: attackAngles },
            { provide: getRepositoryToken(RoutineRunEntity), useValue: routineRuns },
            { provide: getRepositoryToken(ActionPlanItemEntity), useValue: {} },
            { provide: getRepositoryToken(UserActionEntity), useValue: {} },
            { provide: getRepositoryToken(WorkflowRunEntity), useValue: workflowRuns },
            { provide: getRepositoryToken(NoteEntity), useValue: meetingNotes },
            { provide: getRepositoryToken(AgendaBellumCreatedEventEntity), useValue: bellumCreatedEvents },
            { provide: getRepositoryToken(FocusPlanBlockOutcomeEntity), useValue: focusPlanBlockOutcomes },
            { provide: TasksService, useValue: tasksService },
          ],
        }).compile()
        serviceWithTasks = moduleRef.get(BriefingService)
      })

      it('retire la carte quand une tâche ouverte porte la MÊME clé et le MÊME compte', async () => {
        tasksService.openForUser.mockResolvedValue([
          openAccountNoOwnerTask({
            accountId: 'acc-1',
            sourceLabelKey: 'briefing.actions.accountNoOwner?company=ACME',
          }),
        ])

        const all = await serviceWithTasks.allActions('u1')

        expect(all.some(action => action.kind === 'account_no_owner')).toBe(false)
      })

      it('laisse la carte quand la tâche ouverte porte un AUTRE compte', async () => {
        tasksService.openForUser.mockResolvedValue([
          openAccountNoOwnerTask({
            accountId: 'acc-2',
            sourceLabelKey: 'briefing.actions.accountNoOwner?company=ACME',
          }),
        ])

        const all = await serviceWithTasks.allActions('u1')

        expect(all.some(action => action.kind === 'account_no_owner')).toBe(true)
      })

      // #2095.74 (L1, 31/10) — la clé de source ne décide plus SEULE : une tâche
      // manuelle sur le MÊME compte, mais PLUS TARD dans le mois, n'est pas dans
      // la journée — la carte reste. (En retard ou due aujourd'hui, elle la
      // retire : test juste en dessous.)
      it('laisse la carte quand aucune tâche ne porte de clé de source (tâche manuelle, sans rapport)', async () => {
        tasksService.openForUser.mockResolvedValue([
          openAccountNoOwnerTask({ accountId: 'acc-1', sourceLabelKey: null, dueOn: '2099-01-01' }),
        ])

        const all = await serviceWithTasks.allActions('u1')

        expect(all.some(action => action.kind === 'account_no_owner')).toBe(true)
      })

      it('#2095.74 — retire la carte quand une tâche EN RETARD porte le même compte, même sans clé de source', async () => {
        tasksService.openForUser.mockResolvedValue([
          openAccountNoOwnerTask({ accountId: 'acc-1', sourceLabelKey: null, dueOn: '2026-09-26' }),
        ])

        const all = await serviceWithTasks.allActions('u1', new Date('2026-10-31T08:00:00Z'))

        expect(all.some(action => action.kind === 'account_no_owner')).toBe(false)
      })

      // `build()` — l'écran RÉEL de « Aujourd'hui » (`ActionsBlock`, apps/web) —
      // partage la MÊME dérivation que `allActions()` : un test de câblage
      // suffit ici, les cas de rapprochement sont déjà couverts au-dessus.
      it('build() retire aussi la carte — c’est l’écran que le CTA affecte réellement', async () => {
        tasksService.openForUser.mockResolvedValue([
          openAccountNoOwnerTask({
            accountId: 'acc-1',
            sourceLabelKey: 'briefing.actions.accountNoOwner?company=ACME',
          }),
        ])

        const briefing = await serviceWithTasks.build('u1')

        expect(briefing.actions.some(action => action.kind === 'account_no_owner')).toBe(false)
      })

      it('salle de démonstration : build() retire aussi la carte, sur une VRAIE tâche de l’espace', async () => {
        workspaceContext.isDemoWorkspace.mockResolvedValue(true)
        workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-demo', role: 'commercial' })
        accounts.find.mockResolvedValue([])
        tasksService.openForUser.mockResolvedValue([
          openAccountNoOwnerTask({
            accountId: 'acc-1',
            sourceLabelKey: 'briefing.actions.accountNoOwner?company=ACME',
          }),
        ])

        const briefing = await serviceWithTasks.build('u1')

        expect(briefing.actions.some(action => action.kind === 'account_no_owner')).toBe(false)
      })
    })
  })

  /**
   * #3287 reste (#3265.13, recette prod du 30/09/2026) : Thales — le deuxième
   * des trois premiers dossiers seedés (`DEMO_DOSSIERS`, `demo-dataset.ts` :
   * Société Générale, Thales, leboncoin) — n'apparaissait plus sur
   * « Aujourd'hui » en salle. Root cause : `accounts.find({ take: 3 })`
   * n'avait pas d'`order` — sans lui, Postgres ne garantit RIEN sur l'ordre
   * rendu, y compris entre deux appels successifs. `DemoSeedService` écrit
   * les comptes un par un (`for (const dossier of DEMO_DOSSIERS)`), donc
   * `created_at` croît dans le même ordre que le semis — c'est ce que
   * `build()`/`allActions()` doivent maintenant demander explicitement,
   * plutôt que de compter sur un ordre physique non garanti.
   */
  describe('salle de démonstration : les trois premiers dossiers sur « Aujourd’hui » (#3287 reste)', () => {
    beforeEach(() => {
      workspaceContext.isDemoWorkspace.mockResolvedValue(true)
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-demo', role: 'commercial' })
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
      accounts.find.mockResolvedValue([])
    })

    // R21-FIX point 3 (recette 15/10) : « Bonjour Louis » en démo alors que la persona est Maëlle.
    it('R21 — le prénom du brief vient de la persona de la salle, jamais du compte réel', async () => {
      profiles.findOne.mockResolvedValue({ first_name: 'Louis' })

      const brief = await service.build('u1')
      expect(brief.firstName).toBe(DEMO_OWNER.first_name)

      const actions = await service.allActions('u1')
      expect(JSON.stringify(actions)).not.toContain('Louis')
    })

    it('build() demande l’ORDRE D’INSERTION, jamais un ordre physique non garanti', async () => {
      await service.build('u1')

      expect(accounts.find).toHaveBeenCalledWith(expect.objectContaining({ order: { created_at: 'ASC' } }))
    })

    // #3414 (recette 30/09) — la salle ne porte qu'un rôle : `readAs` lui
    // laisse lire le même brief dans l'ordre d'un autre. Démo SEULEMENT.
    it('#3414 — `readAs` fait lire le brief de la salle dans l’ordre d’un autre rôle', async () => {
      mockRoleOrderCalls.length = 0
      await service.build('u1', undefined, undefined, 'recruiter')
      expect(mockRoleOrderCalls.at(-1)).toBe('recruiter')
      await service.build('u1')
      expect(mockRoleOrderCalls.at(-1)).toBe('commercial')
    })

    it('#3414 — hors salle, `readAs` est IGNORÉ : un vrai compte ne se déguise pas', async () => {
      workspaceContext.isDemoWorkspace.mockResolvedValue(false)
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws1', role: 'owner' })
      mockRoleOrderCalls.length = 0
      await service.build('u1', undefined, undefined, 'recruiter')
      expect(mockRoleOrderCalls.at(-1)).toBe('owner')
    })

    it('allActions() demande le MÊME ordre — câblage volontairement dupliqué de build()', async () => {
      await service.allActions('u1')

      expect(accounts.find).toHaveBeenCalledWith(expect.objectContaining({ order: { created_at: 'ASC' } }))
    })
  })

  /**
   * #3256 (BEL-SC-227.19) — risques critiques agrégés : un compte où AU MOINS
   * DEUX signaux (impayé, renouvellement non engagé, exigence d'AO non
   * couverte) convergent. Les trois requêtes recopient le prédicat des
   * builders voisins (`buildOverdueInvoices`, `buildRenewalsNotEngaged`,
   * `buildRfpsWithUncoveredRequirements`) — ces tests ne défendent que
   * l'AGRÉGATION par compte, pas les prédicats eux-mêmes.
   */
  describe('risques critiques agrégés (#3256, BEL-SC-227.19)', () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    const now = new Date('2026-08-03T00:00:00.000Z')

    function mockCriticalRisksQuery(rows: {
      financial?: unknown[]
      mission?: unknown[]
      rfp?: unknown[]
      renewalWindowDays?: unknown
    }) {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM workspaces'))
          return Promise.resolve([{ renewal_window_days: rows.renewalWindowDays ?? null }])
        if (sql.includes('FROM invoice_readiness r') && sql.includes('JOIN accounts a'))
          return Promise.resolve(rows.financial ?? [])
        if (sql.includes('FROM missions m') && sql.includes('JOIN accounts a'))
          return Promise.resolve(rows.mission ?? [])
        if (sql.includes('FROM rfps r') && sql.includes('LEFT JOIN accounts a')) return Promise.resolve(rows.rfp ?? [])
        return Promise.resolve([])
      })
    }

    it('un compte avec un impayé ET une mission en fin de contrat non engagée : deux signaux, il entre dans le bloc', async () => {
      mockCriticalRisksQuery({
        financial: [{ account_id: 'acc-1', company_name: 'ACME' }],
        // now + 25 jours : fenêtre j30 par défaut, comme le test voisin
        // « missions à échéance de renouvellement ».
        mission: [{ account_id: 'acc-1', company_name: 'ACME', ends_on: '2026-08-28' }],
      })

      const briefing = await service.build('u1', now)

      expect(briefing.criticalRisks).toEqual([
        { accountId: 'acc-1', companyName: 'ACME', kinds: ['financial', 'mission'], count: 2 },
      ])
    })

    it('un compte avec UN SEUL signal reste absent — sa carte individuelle suffit', async () => {
      mockCriticalRisksQuery({ financial: [{ account_id: 'acc-1', company_name: 'ACME' }] })

      const briefing = await service.build('u1', now)

      expect(briefing.criticalRisks).toEqual([])
    })

    it('deux missions du MÊME compte en fin de contrat la même semaine — le cas cité par le ticket', async () => {
      mockCriticalRisksQuery({
        mission: [
          { account_id: 'acc-1', company_name: 'ACME', ends_on: '2026-08-28' },
          { account_id: 'acc-1', company_name: 'ACME', ends_on: '2026-08-29' },
        ],
      })

      const briefing = await service.build('u1', now)

      expect(briefing.criticalRisks).toEqual([
        { accountId: 'acc-1', companyName: 'ACME', kinds: ['mission', 'mission'], count: 2 },
      ])
    })

    it('une lecture SQL en échec ne fait pas disparaître le brief', async () => {
      accounts.manager.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM invoice_readiness r') && sql.includes('JOIN accounts a'))
          return Promise.reject(new Error('risques critiques indisponibles'))
        return Promise.resolve([])
      })

      const briefing = await service.build('u1', now)

      expect(briefing.criticalRisks).toEqual([])
    })
  })

  /**
   * GARDE PERF (29/09/2026, mesuré en prod : `GET /briefing/today` 8,5 s,
   * `GET /briefing/actions` 5,7 s).
   *
   * `build()` et `allActions()` lancent ~25 producteurs EN PARALLÈLE, et chacun
   * résolvait pour lui-même l'espace actif (2 à 4 requêtes, sur un pool TypeORM
   * de 10) : ~80 requêtes de résolution pour UNE réponse. Les appels
   * concurrents partagent maintenant UNE résolution. Les blocs agenda et
   * messagerie — des appels SORTANTS chez le fournisseur — sont retenus 60 s
   * par personne quand ils ont répondu.
   */
  describe('budget de requêtes — perf 29/09/2026', () => {
    const offlineMail = {
      connected: false,
      provider: null,
      address: null,
      capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
    }
    const offlineAgenda = { connected: false, provider: null, capabilities: { read: false, write: false } }
    /** Une résolution qui prend du TEMPS : c'est ce qui laisse les producteurs se chevaucher. */
    const slowResolve = () =>
      workspaceContext.resolveActiveWorkspace.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 5))
        return { workspaceId: 'ws1', role: 'owner' }
      })
    // Plafond chiffré (mesuré après correction : 1 ; 3 de marge pour les
    // producteurs qui démarrent après un premier `await`).
    const MAX_RESOLUTIONS = 4

    it('build() : l’espace actif est résolu quelques fois au plus, pas une fois par producteur', async () => {
      agenda.status.mockResolvedValue(offlineAgenda)
      mailbox.status.mockResolvedValue(offlineMail)
      slowResolve()

      await service.build('u1')

      expect(workspaceContext.resolveActiveWorkspace.mock.calls.length).toBeLessThanOrEqual(MAX_RESOLUTIONS)
    })

    it('allActions() : même plafond', async () => {
      agenda.status.mockResolvedValue(offlineAgenda)
      mailbox.status.mockResolvedValue(offlineMail)
      slowResolve()

      await service.allActions('u1')

      expect(workspaceContext.resolveActiveWorkspace.mock.calls.length).toBeLessThanOrEqual(MAX_RESOLUTIONS)
    })

    it('3 puis 30 signaux frais : le MÊME nombre de lectures', async () => {
      agenda.status.mockResolvedValue(offlineAgenda)
      mailbox.status.mockResolvedValue(offlineMail)
      const now = new Date('2026-08-03T08:00:00Z')
      const measure = async (count: number) => {
        accounts.find.mockClear()
        accounts.manager.query.mockClear()
        const rows = Array.from({ length: count }, (_, i) => ({
          account_id: `a-${i}`,
          status: 'active',
          first_detected_at: '2026-08-02T08:00:00Z',
        }))
        signalHistory.listForWorkspace.mockResolvedValue(rows)
        accounts.find.mockResolvedValue(rows.map(row => ({ id: row.account_id, company_name: row.account_id })))
        await service.build('u1', now)
        return accounts.find.mock.calls.length + accounts.manager.query.mock.calls.length
      }
      const small = await measure(3)
      const large = await measure(30)
      expect(large).toBe(small)
    })

    it('agenda et messagerie : une seconde lecture dans la minute ne rappelle PAS le fournisseur', async () => {
      agenda.status.mockResolvedValue({
        connected: true,
        provider: 'google',
        capabilities: { read: true, write: true },
      })
      agenda.listEventsDetailed.mockResolvedValue({ events: [], unavailable: [] })
      mailbox.status.mockResolvedValue({
        connected: true,
        provider: 'google',
        address: 'moi@bellum.fr',
        capabilities: { read: true, draft: true, send: true, labels: false, outOfOffice: false },
      })
      mailbox.search.mockResolvedValue({ threads: [] })

      await service.build('u1')
      const agendaCalls = agenda.listEventsDetailed.mock.calls.length
      const mailCalls = mailbox.search.mock.calls.length
      await service.build('u1')
      await service.allActions('u1')

      expect(agenda.listEventsDetailed.mock.calls.length).toBe(agendaCalls)
      expect(mailbox.search.mock.calls.length).toBe(mailCalls)
    })

    it('une panne du fournisseur n’est JAMAIS retenue : la lecture suivante réessaie', async () => {
      agenda.status.mockResolvedValue({
        connected: true,
        provider: 'google',
        capabilities: { read: true, write: true },
      })
      agenda.listEventsDetailed.mockRejectedValueOnce(new Error('API Calendar éteinte'))
      agenda.listEventsDetailed.mockResolvedValue({ events: [], unavailable: [] })
      mailbox.status.mockResolvedValue(offlineMail)

      const first = await service.build('u1')
      const second = await service.build('u1')

      expect(first.agenda.state).toBe('unavailable')
      expect(second.agenda.state).toBe('ready')
    })

    it('une autre personne ne lit jamais le bloc d’une autre', async () => {
      agenda.status.mockResolvedValue({
        connected: true,
        provider: 'google',
        capabilities: { read: true, write: true },
      })
      agenda.listEventsDetailed.mockResolvedValue({ events: [], unavailable: [] })
      mailbox.status.mockResolvedValue(offlineMail)

      await service.build('u1')
      // Deux lectures par brief : la fenêtre à venir et la fenêtre passée.
      expect(agenda.listEventsDetailed).toHaveBeenCalledTimes(2)
      await service.build('u2')

      expect(agenda.listEventsDetailed).toHaveBeenCalledTimes(4)
    })
  })

  // #3386 (recette prod 03/10) — changer son rôle métier puis « Actualiser » ne
  // changeait RIEN : seul le pont de Laura transmettait le rôle déclaré
  // (`esn_profiles.user_role`), jamais l'écran (`GET /briefing/today`).
  describe("le rôle métier déclaré réordonne le brief de l'écran (#3386)", () => {
    beforeEach(() => {
      agenda.status.mockResolvedValue({ connected: false, provider: null, capabilities: { read: false, write: false } })
      mailbox.status.mockResolvedValue({
        connected: false,
        provider: null,
        address: null,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
      })
    })

    it.each(['Fondateur / CEO', 'Business Developer'])("lit « %s » sur le profil et le passe à l'ordre", async role => {
      mockRoleCalls.length = 0
      esnProfiles.findOne.mockResolvedValue({ user_role: role })
      await service.build('u1')
      expect(mockRoleCalls[0]?.[2]).toBe(role)
    })

    it('un appelant qui transmet le rôle (Laura) garde la main sur la lecture du profil', async () => {
      mockRoleCalls.length = 0
      esnProfiles.findOne.mockResolvedValue({ user_role: 'Fondateur / CEO' })
      await service.build('u1', undefined, undefined, undefined, 'Business Manager')
      expect(mockRoleCalls[0]?.[2]).toBe('Business Manager')
    })

    // décision Louis 12/10 — « Lire comme » dans le produit : un rôle qui ENCADRE lit le même brief
    // dans l'ordre d'un autre rôle (c76 : l'ordre seul change).
    it.each(['Directeur de BU', 'Fondateur / CEO'])(
      "« %s » (rôle qui encadre) : `readAs` réordonne le brief, le rôle déclaré s'efface pour cette lecture",
      async declared => {
        mockRoleCalls.length = 0
        esnProfiles.findOne.mockResolvedValue({ user_role: declared })
        await service.build('u1', undefined, undefined, 'recruiter')
        expect(mockRoleCalls[0]?.[1]).toBe('recruiter')
        expect(mockRoleCalls[0]?.[2] ?? null).toBeNull()
      },
    )

    it.each(['Business Developer', 'Talent Manager / Recruteur'])(
      '« %s » (ne encadre pas) : `readAs` est ignoré, le rôle déclaré fait foi',
      async declared => {
        mockRoleCalls.length = 0
        esnProfiles.findOne.mockResolvedValue({ user_role: declared })
        await service.build('u1', undefined, undefined, 'recruiter')
        expect(mockRoleCalls[0]?.[1]).not.toBe('recruiter')
        expect(mockRoleCalls[0]?.[2]).toBe(declared)
      },
    )

    it('profil absent ou illisible : aucun rôle deviné, le brief se construit quand même', async () => {
      mockRoleCalls.length = 0
      esnProfiles.findOne.mockRejectedValue(new Error('esn_profiles indisponible'))
      await expect(service.build('u1')).resolves.toBeDefined()
      expect(mockRoleCalls[0]?.[2] ?? null).toBeNull()
    })

    it('chaque appel porte SON horodatage (jamais un brief servi de mémoire)', async () => {
      const first = await service.build('u1', new Date('2026-10-03T10:24:00Z'))
      const second = await service.build('u1', new Date('2026-10-03T10:26:00Z'))
      expect(first.generatedAt).not.toBe(second.generatedAt)
    })
  })

  /**
   * #3973 — le brief que LAURA lit (pont `/internal/copilot/briefing`) suit
   * « Outils et sources » : la messagerie ou l'agenda décoché pour ce fil n'est
   * jamais lu ; décoché en ENTIER, son bloc n'est pas lu du tout et le dit.
   * Les autres appelants (écran, routines) ne passent aucun périmètre : inchangés.
   */
  describe('#3973 — le périmètre de lecture du fil', () => {
    const connectedMail = {
      connected: true,
      provider: 'google',
      address: 'moi@bellum.fr',
      capabilities: { read: true, draft: true, send: true, labels: false, outOfOffice: false },
    }
    const connectedAgenda = { connected: true, provider: 'google', capabilities: { read: true, write: true } }

    it('relaie les messageries et agendas exclus à CHAQUE lecture du brief', async () => {
      agenda.status.mockResolvedValue(connectedAgenda)
      agenda.listEventsDetailed.mockResolvedValue({ events: [], unavailable: [] })
      mailbox.status.mockResolvedValue(connectedMail)
      mailbox.search.mockResolvedValue({ threads: [] })
      agenda.listEventsDetailed.mockClear()
      mailbox.search.mockClear()

      const briefing = await service.build('u-scope-1', new Date('2026-09-24T08:15:00.000Z'), null, null, null, {
        mailbox: { excludedProviders: ['google'] },
        agenda: { excludedProviders: ['microsoft'] },
      })

      expect(briefing.mail.state).toBe('ready')
      expect(mailbox.search).toHaveBeenCalledTimes(3)
      for (const call of mailbox.search.mock.calls) expect(call[2]).toEqual({ excludedProviders: ['google'] })
      // Le bloc agenda ET les rendez-vous passés sans suite.
      expect(agenda.listEventsDetailed).toHaveBeenCalledTimes(2)
      for (const call of agenda.listEventsDetailed.mock.calls) {
        expect(call[2]).toEqual({ excludedProviders: ['microsoft'] })
      }
    })

    it('messagerie et agenda décochés EN ENTIER : rien n’est lu, et le bloc le dit', async () => {
      agenda.status.mockResolvedValue(connectedAgenda)
      mailbox.status.mockResolvedValue(connectedMail)
      agenda.listEventsDetailed.mockClear()
      mailbox.search.mockClear()

      const briefing = await service.build('u-scope-2', new Date('2026-09-24T08:15:00.000Z'), null, null, null, {
        mailbox: { excludedProviders: ['google', 'microsoft'] },
        agenda: { excludedProviders: ['google', 'microsoft'] },
      })

      expect(mailbox.search).not.toHaveBeenCalled()
      expect(agenda.listEventsDetailed).not.toHaveBeenCalled()
      expect(briefing.mail.reason).toBe('mailbox_excluded_for_thread')
      expect(briefing.mail.readAt).toBeNull()
      expect(briefing.agenda.reason).toBe('agenda_excluded_for_thread')
      expect(briefing.agenda.readAt).toBeNull()
    })

    it('un brief retenu SANS périmètre ne sert jamais un fil qui en a un', async () => {
      agenda.status.mockResolvedValue(connectedAgenda)
      agenda.listEventsDetailed.mockResolvedValue({ events: [], unavailable: [] })
      mailbox.status.mockResolvedValue(connectedMail)
      mailbox.search.mockResolvedValue({ threads: [] })

      await service.build('u-scope-3')
      mailbox.search.mockClear()
      agenda.listEventsDetailed.mockClear()
      await service.build('u-scope-3', undefined, null, null, null, {
        mailbox: { excludedProviders: ['google'] },
        agenda: { excludedProviders: ['google'] },
      })

      expect(mailbox.search).toHaveBeenCalledTimes(3)
      expect(agenda.listEventsDetailed.mock.calls.length).toBeGreaterThan(0)
    })
  })
})
