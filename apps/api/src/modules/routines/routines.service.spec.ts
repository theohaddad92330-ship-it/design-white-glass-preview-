import { Logger } from '@nestjs/common'
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
import { ROUTINE_CATALOG } from './routine-catalog'
import { RoutineExecutors } from './routine-executors'
import { RoutinesService } from './routines.service'

/**
 * Ce que ces tests défendent : une routine ne part jamais deux fois, ne part
 * jamais avant d'avoir été vue, et ne s'affiche jamais « active » quand elle n'a
 * rien à lire.
 */
describe('RoutinesService', () => {
  const subscriptions = { find: jest.fn(), findOne: jest.fn(), insert: jest.fn(), save: jest.fn(), create: jest.fn() }
  const runs = { find: jest.fn(), findOne: jest.fn(), query: jest.fn(), insert: jest.fn(), update: jest.fn() }
  const notifications = { createNotification: jest.fn(), createProactiveBatch: jest.fn() }
  const executors = { run: jest.fn() }
  const mailbox = { status: jest.fn() }
  const agenda = { status: jest.fn() }
  const ats = { status: jest.fn() }
  const crm = { isConnected: jest.fn() }
  const accounts = { count: jest.fn() }
  const workspaceContext = { isDemoWorkspace: jest.fn(), resolveActiveWorkspace: jest.fn() }

  let service: RoutinesService

  const CONNECTED_MAILBOX = {
    connected: true,
    provider: 'google',
    address: 'moi@bellum.fr',
    capabilities: { read: true, draft: true, send: true, labels: false, outOfOffice: false },
  }
  const CONNECTED_AGENDA = { connected: true, provider: 'google', capabilities: { read: true, write: true } }

  beforeEach(async () => {
    jest.resetAllMocks()
    subscriptions.find.mockResolvedValue([])
    subscriptions.findOne.mockResolvedValue(null)
    subscriptions.insert.mockResolvedValue(undefined)
    subscriptions.create.mockImplementation((value: unknown) => value)
    subscriptions.save.mockResolvedValue(undefined)
    runs.findOne.mockResolvedValue(null)
    runs.query.mockResolvedValue([])
    runs.insert.mockResolvedValue(undefined)
    runs.update.mockResolvedValue(undefined)
    mailbox.status.mockResolvedValue(CONNECTED_MAILBOX)
    agenda.status.mockResolvedValue(CONNECTED_AGENDA)
    crm.isConnected.mockResolvedValue(true)
    ats.status.mockResolvedValue({
      connected: true,
      provider: 'boondmanager',
      authMode: 'user_token',
      connectedAt: null,
      fromEnvironment: false,
    })
    workspaceContext.isDemoWorkspace.mockResolvedValue(false)
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w1', role: 'owner' })
    accounts.count.mockResolvedValue(3)
    executors.run.mockResolvedValue({ notified: false, outcome: 'Rien à signaler.' })

    const moduleRef = await Test.createTestingModule({
      providers: [
        RoutinesService,
        { provide: getRepositoryToken(RoutineSubscriptionEntity), useValue: subscriptions },
        { provide: getRepositoryToken(RoutineRunEntity), useValue: runs },
        { provide: getRepositoryToken(AccountEntity), useValue: accounts },
        { provide: NotificationsService, useValue: notifications },
        { provide: RoutineExecutors, useValue: executors },
        { provide: MailboxService, useValue: mailbox },
        { provide: AgendaService, useValue: agenda },
        { provide: AtsService, useValue: ats },
        { provide: CrmService, useValue: crm },
        { provide: WorkspaceContextService, useValue: workspaceContext },
      ],
    }).compile()

    service = moduleRef.get(RoutinesService)
  })

  it('matérialise les défauts à la première consultation — visible avant actif', () => {
    return service.list('u1').then(views => {
      expect(subscriptions.insert).toHaveBeenCalledTimes(1)
      expect(views).toHaveLength(ROUTINE_CATALOG.length)
    })
  })

  // GA — perf P5 (29/09) : `list` ne fait PLUS une requête par routine. Le
  // catalogue en compte ~42 ; avant, `runs.findOne` partait 42 fois en série
  // (1,6-4,7 s en prod). Plafond chiffré : UNE lecture des exécutions, ZÉRO
  // `findOne`, et au plus 2 lectures de souscriptions — quel que soit le nombre
  // de lignes déjà matérialisées (3 puis toutes).
  it.each([3, ROUTINE_CATALOG.length])(
    'perf — `list` lit les dernières exécutions en UNE requête (%i souscriptions existantes)',
    async existing => {
      subscriptions.find.mockResolvedValue(
        ROUTINE_CATALOG.slice(0, existing).map(definition => ({ routine_key: definition.key, user_id: 'u1' })),
      )

      await service.list('u1')

      expect(runs.findOne).not.toHaveBeenCalled()
      expect(runs.query).toHaveBeenCalledTimes(1)
      expect(subscriptions.find.mock.calls.length).toBeLessThanOrEqual(2)
    },
  )

  it('#2205.26/.55 — dit qu’une dernière exécution a ÉCHOUÉ, sans jamais deviner', async () => {
    runs.query.mockResolvedValue(
      ROUTINE_CATALOG.map(definition => ({
        routine_key: definition.key,
        created_at: new Date('2026-09-20T08:00:00.000Z'),
        outcome: 'Échec : Graph 503',
        notified: false,
      })),
    )

    const views = await service.list('u1')

    expect(views[0].lastFailed).toBe(true)
  })

  it('un résultat normal n’est jamais marqué en échec', async () => {
    runs.query.mockResolvedValue(
      ROUTINE_CATALOG.map(definition => ({
        routine_key: definition.key,
        created_at: new Date('2026-09-20T08:00:00.000Z'),
        outcome: '3 fils sans réponse',
        notified: true,
      })),
    )

    const views = await service.list('u1')

    expect(views[0].lastFailed).toBe(false)
  })

  it('aucune exécution passée : `lastFailed` n’est jamais mesuré à `false`', async () => {
    runs.query.mockResolvedValue([])

    const views = await service.list('u1')

    expect(views[0].lastFailed).toBeUndefined()
  })

  // #2205.49-52/.62 — la table `routine_runs` existait déjà mais aucun écran
  // ne la lisait au-delà du DERNIER résultat : impossible de répondre « les
  // routines tournent-elles vraiment, jour après jour ? ».
  describe('listRuns', () => {
    it('rend l’historique scopé au bon utilisateur ET à la bonne routine, le plus récent en premier', async () => {
      runs.find.mockResolvedValueOnce([
        {
          id: 'run-2',
          created_at: new Date('2026-09-22T08:00:00.000Z'),
          notified: true,
          outcome: '2 fils sans réponse',
          proof_ref: 'https://mail.example/d1',
        },
        {
          id: 'run-1',
          created_at: new Date('2026-09-21T08:00:00.000Z'),
          notified: false,
          outcome: 'Échec : Graph 503',
          proof_ref: null,
        },
      ])

      const history = await service.listRuns('u1', 'daily_briefing')

      expect(runs.find).toHaveBeenCalledWith({
        where: { user_id: 'u1', routine_key: 'daily_briefing' },
        order: { created_at: 'DESC' },
        take: 20,
      })
      expect(history).toEqual([
        {
          id: 'run-2',
          createdAt: '2026-09-22T08:00:00.000Z',
          notified: true,
          outcome: '2 fils sans réponse',
          failed: false,
          // #2205.54 — la preuve vérifiable, relayée telle quelle.
          proofRef: 'https://mail.example/d1',
        },
        {
          id: 'run-1',
          createdAt: '2026-09-21T08:00:00.000Z',
          notified: false,
          outcome: 'Échec : Graph 503',
          failed: true,
          proofRef: null,
        },
      ])
    })

    it('routine jamais exécutée : historique vide, jamais une erreur', async () => {
      runs.find.mockResolvedValueOnce([])

      await expect(service.listRuns('u1', 'daily_briefing')).resolves.toEqual([])
    })

    it('refuse une clé de routine inconnue — même garde que `runDueFor`', async () => {
      await expect(service.listRuns('u1', 'not_a_routine')).rejects.toThrow()
      expect(runs.find).not.toHaveBeenCalled()
    })
  })

  it('ne réécrit pas une routine que l’utilisateur a déjà réglée', async () => {
    subscriptions.find.mockResolvedValue(
      ROUTINE_CATALOG.map(definition => ({
        routine_key: definition.key,
        enabled: false,
        hour: 7,
        weekday: definition.defaultWeekday,
        channel: 'in_app',
        time_zone: 'Europe/Paris',
      })),
    )
    const views = await service.list('u1')
    expect(subscriptions.insert).not.toHaveBeenCalled()
    expect(views.every(view => view.subscription.enabled === false)).toBe(true)
  })

  /**
   * #2916 (#2399.6/.7) — LE DÉCLENCHEUR du versioning : une ligne dont
   * `seen_version` (base) est en retard sur `definition.version` (catalogue)
   * doit se voir marquée `updated`, sans qu'aucun humain n'ait à comparer les
   * deux entiers lui-même.
   */
  it('#2916 (#2399.6/.7) — marque `updated` quand `seen_version` est en retard sur le catalogue', async () => {
    subscriptions.find.mockResolvedValue(
      ROUTINE_CATALOG.map(definition => ({
        routine_key: definition.key,
        enabled: true,
        hour: definition.defaultHour,
        weekday: definition.defaultWeekday,
        channel: definition.defaultChannel,
        time_zone: 'Europe/Paris',
        seen_version: definition.key === 'daily_briefing' ? 0 : definition.version,
      })),
    )
    const views = await service.list('u1')
    expect(views.find(view => view.definition.key === 'daily_briefing')?.updated).toBe(true)
    expect(views.find(view => view.definition.key === 'meeting_prep')?.updated).toBe(false)
  })

  it('#2916 (#2399.7) — une routine en retard de version porte ce qui a changé ; une à jour, rien', async () => {
    subscriptions.find.mockResolvedValue(
      ROUTINE_CATALOG.map(definition => ({
        routine_key: definition.key,
        enabled: true,
        hour: definition.defaultHour,
        weekday: definition.defaultWeekday,
        channel: definition.defaultChannel,
        time_zone: 'Europe/Paris',
        seen_version: definition.key === 'no_reply_follow_up' ? 1 : definition.version,
      })),
    )
    const views = await service.list('u1')
    const stale = views.find(view => view.definition.key === 'no_reply_follow_up')
    expect(stale?.updated).toBe(true)
    expect(stale?.versionNotes?.map(note => note.version)).toEqual([2])
    expect(views.find(view => view.definition.key === 'meeting_prep')?.versionNotes).toBeUndefined()
  })

  it('dit ce qui empêche une routine de tourner plutôt que de la laisser cochée', async () => {
    mailbox.status.mockResolvedValue({ ...CONNECTED_MAILBOX, connected: false })
    const views = await service.list('u1')
    const noReply = views.find(view => view.definition.key === 'no_reply_follow_up')
    expect(noReply?.blockers).toEqual(['mailbox_not_connected'])
    const conflicts = views.find(view => view.definition.key === 'agenda_conflicts')
    expect(conflicts?.blockers).toEqual([])
  })

  // #2399.8/#2399.9 — `no_accounts` était déjà un blocker DÉCLARÉ
  // (`routineBlockerSchema`, i18n `blocker.no_accounts` dans les deux
  // langues) mais jamais PRODUIT : `resolveBlockers` ne comptait aucun
  // compte, donc une routine `requires: ['accounts']` se montrait toujours
  // activable même dans un espace sans aucun compte suivi — exactement la
  // « automatisation séduisante mais non exécutable » que #2399.9 interdit.
  it('#2399.8/#2399.9 — bloque une automatisation qui lit les comptes quand l’espace n’en suit aucun', async () => {
    accounts.count.mockResolvedValue(0)
    const views = await service.list('u1')
    const referencing = views.find(view => view.definition.key === 'referencing_window')
    expect(referencing?.blockers).toEqual(['no_accounts'])
  })

  it('#2399.8/#2399.9 — un espace qui suit des comptes ne bloque pas la routine', async () => {
    accounts.count.mockResolvedValue(1)
    const views = await service.list('u1')
    const referencing = views.find(view => view.definition.key === 'referencing_window')
    expect(referencing?.blockers).toEqual([])
  })

  it('#2399.8/#2399.9 — un compteur de comptes illisible ne bloque pas à tort (l’échec remonte, ne se lit jamais « zéro »)', async () => {
    accounts.count.mockRejectedValue(new Error('connexion perdue'))
    const views = await service.list('u1')
    const referencing = views.find(view => view.definition.key === 'referencing_window')
    expect(referencing?.blockers).toEqual([])
  })

  it('#2399.8/#2399.9 — sans espace actif, la routine ne se bloque pas à tort', async () => {
    workspaceContext.resolveActiveWorkspace.mockRejectedValue(new Error('Aucun espace de travail associé'))
    const views = await service.list('u1')
    const referencing = views.find(view => view.definition.key === 'referencing_window')
    expect(referencing?.blockers).toEqual([])
  })

  it('réserve la trace AVANT d’envoyer — rater un envoi se répare, un double envoi non', async () => {
    subscriptions.find.mockResolvedValue([
      {
        routine_key: 'daily_briefing',
        enabled: true,
        hour: 8,
        weekday: null,
        channel: 'in_app',
        time_zone: 'Europe/Paris',
      },
    ])
    executors.run.mockResolvedValue({
      notified: true,
      outcome: '2 actions.',
      notification: { title: 'Ta journée', body: '2 actions', link: '/briefing' },
    })

    await service.runDueFor('u1', new Date('2026-08-03T06:30:00Z'))

    const insertOrder = runs.insert.mock.invocationCallOrder[0]
    // Le lot part APRÈS la boucle, donc après toutes les réservations : la
    // propriété qu'on garde est la même — rater un envoi se répare, un double
    // envoi non.
    const notifyOrder = notifications.createProactiveBatch.mock.invocationCallOrder[0]
    expect(insertOrder).toBeLessThan(notifyOrder)
  })

  it('n’envoie rien quand une autre instance a déjà pris l’occurrence', async () => {
    subscriptions.find.mockResolvedValue([
      {
        routine_key: 'daily_briefing',
        enabled: true,
        hour: 8,
        weekday: null,
        channel: 'in_app',
        time_zone: 'Europe/Paris',
      },
    ])
    runs.insert.mockRejectedValue(new Error('duplicate key value violates unique constraint'))

    const executed = await service.runDueFor('u1', new Date('2026-08-03T06:30:00Z'))

    expect(executed).toBe(0)
    expect(notifications.createNotification).not.toHaveBeenCalled()
  })

  it('n’exécute pas une routine dont la capacité manque', async () => {
    mailbox.status.mockResolvedValue({ ...CONNECTED_MAILBOX, connected: false })
    subscriptions.find.mockResolvedValue([
      {
        routine_key: 'no_reply_follow_up',
        enabled: true,
        hour: 8,
        weekday: null,
        channel: 'in_app',
        time_zone: 'Europe/Paris',
      },
    ])

    await service.runDueFor('u1', new Date('2026-08-03T06:30:00Z'))

    expect(executors.run).not.toHaveBeenCalledWith('no_reply_follow_up', expect.anything(), expect.anything())
  })

  it('écrit la cause quand une routine échoue — un échec silencieux est pire', async () => {
    subscriptions.find.mockResolvedValue([
      {
        routine_key: 'daily_briefing',
        enabled: true,
        hour: 8,
        weekday: null,
        channel: 'in_app',
        time_zone: 'Europe/Paris',
      },
    ])
    executors.run.mockRejectedValue(new Error('Graph 503'))

    await service.runDueFor('u1', new Date('2026-08-03T06:30:00Z'))

    expect(runs.update).toHaveBeenCalledWith(
      expect.objectContaining({ run_key: 'u1:daily_briefing:2026-08-03' }),
      expect.objectContaining({ notified: false, outcome: 'Échec : Graph 503' }),
    )
  })

  // #2205.54 — la PREUVE d'exécution voyage jusqu'à la trace persistée,
  // jamais recalculée ici (relayée telle quelle depuis l'exécuteur).
  it('persiste la preuve d’exécution quand l’exécuteur en rend une', async () => {
    subscriptions.find.mockResolvedValue([
      {
        routine_key: 'no_reply_follow_up',
        enabled: true,
        hour: 8,
        weekday: null,
        channel: 'in_app',
        time_zone: 'Europe/Paris',
      },
    ])
    executors.run.mockResolvedValue({
      notified: true,
      outcome: '1 fil(s) sans réponse — une relance préparée.',
      proofRef: 'https://mail.example/d1',
    })

    await service.runDueFor('u1', new Date('2026-08-03T06:30:00Z'))

    expect(runs.update).toHaveBeenCalledWith(
      expect.objectContaining({ run_key: 'u1:no_reply_follow_up:2026-08-03' }),
      expect.objectContaining({ proof_ref: 'https://mail.example/d1' }),
    )
  })

  it('aucune preuve rendue par l’exécuteur : persiste `null`, jamais un champ omis', async () => {
    subscriptions.find.mockResolvedValue([
      {
        routine_key: 'daily_briefing',
        enabled: true,
        hour: 8,
        weekday: null,
        channel: 'in_app',
        time_zone: 'Europe/Paris',
      },
    ])
    executors.run.mockResolvedValue({ notified: false, outcome: 'Rien à signaler.' })

    await service.runDueFor('u1', new Date('2026-08-03T06:30:00Z'))

    expect(runs.update).toHaveBeenCalledWith(
      expect.objectContaining({ run_key: 'u1:daily_briefing:2026-08-03' }),
      expect.objectContaining({ proof_ref: null }),
    )
  })

  it('ne joue aucun envoi dans une salle de démonstration', async () => {
    workspaceContext.isDemoWorkspace.mockResolvedValue(true)
    const executed = await service.runDueFor('u1', new Date('2026-08-03T06:30:00Z'))
    expect(executed).toBe(0)
    expect(runs.insert).not.toHaveBeenCalled()
  })

  it('une routine continue notifie UNE FOIS par objet, jamais par balayage', async () => {
    // Seule `meeting_checklist` est active ; les autres routines continues sont
    // explicitement coupées pour que le test porte sur une seule d'entre elles.
    subscriptions.find.mockResolvedValue(
      ROUTINE_CATALOG.map(definition => ({
        routine_key: definition.key,
        enabled: definition.key === 'meeting_checklist',
        hour: 8,
        weekday: definition.defaultWeekday,
        channel: 'in_app',
        time_zone: 'Europe/Paris',
      })),
    )
    executors.run.mockResolvedValue({
      notified: false,
      outcome: '2 rendez-vous imminents.',
      items: [
        { objectId: 'evt-1', outcome: 'annoncé', notification: { title: 'A', body: '', link: '/briefing' } },
        { objectId: 'evt-2', outcome: 'annoncé', notification: { title: 'B', body: '', link: '/briefing' } },
      ],
    })
    // Le premier objet a déjà été annoncé : sa réservation échoue, le second passe.
    runs.insert.mockRejectedValueOnce(new Error('duplicate key')).mockResolvedValueOnce(undefined)

    const executed = await service.runDueFor('u1', new Date('2026-08-03T14:07:00Z'))

    expect(executed).toBe(1)
    expect(notifications.createNotification).toHaveBeenCalledTimes(1)
    expect(runs.insert).toHaveBeenCalledWith(expect.objectContaining({ run_key: 'u1:meeting_checklist:obj:evt-2' }))
  })

  it('une routine continue tourne quelle que soit l’heure', async () => {
    subscriptions.find.mockResolvedValue(
      ROUTINE_CATALOG.map(definition => ({
        routine_key: definition.key,
        enabled: definition.key === 'meeting_checklist',
        hour: 8,
        weekday: definition.defaultWeekday,
        channel: 'in_app',
        time_zone: 'Europe/Paris',
      })),
    )
    executors.run.mockResolvedValue({ notified: false, outcome: 'rien', items: [] })

    // 23 h 40 locales : très loin de l'heure réglée, et pourtant elle tourne.
    await service.runDueFor('u1', new Date('2026-08-03T21:40:00Z'))
    // Routine CONTINUE : passe par `runContinuous`, qui ne porte pas le
    // plafond de destinataires (#2205.45, réservé au balayage principal) —
    // 5 arguments, inchangé.
    expect(executors.run).toHaveBeenCalledWith(
      'meeting_checklist',
      'u1',
      expect.any(Date),
      expect.any(String),
      expect.any(Object),
    )
  })

  it('refuse une clé de routine inconnue', async () => {
    await expect(service.update('u1', 'inexistante', { enabled: true })).rejects.toThrow(/inconnue/)
  })

  // #2843 (#2205.45) — le plafond réglé sur l'abonnement atteint l'exécuteur,
  // jamais recalculé côté service.
  it('transmet le plafond de destinataires réglé à l’exécuteur', async () => {
    subscriptions.find.mockResolvedValue([
      {
        routine_key: 'no_reply_follow_up',
        enabled: true,
        hour: 8,
        weekday: null,
        channel: 'in_app',
        time_zone: 'Europe/Paris',
        max_items_per_run: 3,
      },
    ])
    executors.run.mockResolvedValue({ notified: false, outcome: 'rien' })

    await service.runDueFor('u1', new Date('2026-08-03T06:30:00Z'))

    expect(executors.run).toHaveBeenCalledWith(
      'no_reply_follow_up',
      'u1',
      expect.any(Date),
      expect.any(String),
      expect.any(Object),
      3,
    )
  })

  describe('#2875/#2402.1/#2402.14 — corrélation des déclencheurs Delivery', () => {
    /** Lundi (weekday 1) ET jour ouvré, 9 h Paris (été, UTC+2). */
    const NOW = new Date('2026-08-03T07:05:00Z')

    beforeEach(() => {
      subscriptions.find.mockResolvedValue([
        {
          routine_key: 'timesheet_chase',
          enabled: true,
          hour: 9,
          weekday: null,
          channel: 'in_app',
          time_zone: 'Europe/Paris',
        },
        {
          routine_key: 'margin_alert',
          enabled: true,
          hour: 9,
          weekday: 1,
          channel: 'in_app',
          time_zone: 'Europe/Paris',
        },
      ])
    })

    it('deux routines Delivery dues le même balayage, même espace : « Signaux combinés » paraît', async () => {
      executors.run.mockImplementation((key: string) => {
        if (key === 'timesheet_chase') {
          return Promise.resolve({
            notified: true,
            outcome: '2 relevés manquants.',
            notification: { title: 't', body: 'b', link: '/missions/cra' },
            triggerEvent: {
              eventId: '00000000-0000-4000-8000-000000000001',
              type: 'timesheet_chase',
              source: 'delivery-routines',
              object: { subjectType: 'workspace', subjectId: 'w1' },
              timestamp: NOW.toISOString(),
              scope: { workspaceId: 'w1', ownerId: null },
              evidence: '2 relevés manquants.',
              confidence: 'mesuree',
              severity: 50,
              urgency: 'normal',
              dedupeKey: 'w1:timesheet_chase:w1',
              cooldownDays: null,
              expiresAt: null,
              eligibleActions: [],
              eligibleNotifications: [],
              permission: null,
              status: 'open',
            },
          })
        }
        if (key === 'margin_alert') {
          return Promise.resolve({
            notified: true,
            outcome: '1 mission sous le seuil.',
            notification: { title: 't', body: 'b', link: '/missions' },
            triggerEvent: {
              eventId: '00000000-0000-4000-8000-000000000002',
              type: 'margin_alert',
              source: 'delivery-routines',
              object: { subjectType: 'workspace', subjectId: 'w1' },
              timestamp: NOW.toISOString(),
              scope: { workspaceId: 'w1', ownerId: null },
              evidence: '1 mission sous le seuil.',
              confidence: 'mesuree',
              severity: 50,
              urgency: 'normal',
              dedupeKey: 'w1:margin_alert:w1',
              cooldownDays: null,
              expiresAt: null,
              eligibleActions: [],
              eligibleNotifications: [],
              permission: null,
              status: 'open',
            },
          })
        }
        return Promise.resolve({ notified: false, outcome: 'rien' })
      })
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

      await service.runDueFor('u1', NOW)

      const combined = logSpy.mock.calls
        .map(call => String(call[0]))
        .find(message => message.includes('Signaux Delivery combinés'))
      expect(combined).toBeDefined()
      expect(combined).toContain('timesheet_chase')
      expect(combined).toContain('margin_alert')
      logSpy.mockRestore()
    })

    it('un seul déclencheur Delivery ce balayage : aucune ligne « Signaux Delivery combinés »', async () => {
      executors.run.mockImplementation((key: string) => {
        if (key === 'timesheet_chase') {
          return Promise.resolve({
            notified: true,
            outcome: '2 relevés manquants.',
            notification: { title: 't', body: 'b', link: '/missions/cra' },
            triggerEvent: {
              eventId: '00000000-0000-4000-8000-000000000001',
              type: 'timesheet_chase',
              source: 'delivery-routines',
              object: { subjectType: 'workspace', subjectId: 'w1' },
              timestamp: NOW.toISOString(),
              scope: { workspaceId: 'w1', ownerId: null },
              evidence: '2 relevés manquants.',
              confidence: 'mesuree',
              severity: 50,
              urgency: 'normal',
              dedupeKey: 'w1:timesheet_chase:w1',
              cooldownDays: null,
              expiresAt: null,
              eligibleActions: [],
              eligibleNotifications: [],
              permission: null,
              status: 'open',
            },
          })
        }
        return Promise.resolve({ notified: false, outcome: 'rien' })
      })
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

      await service.runDueFor('u1', NOW)

      const combined = logSpy.mock.calls
        .map(call => String(call[0]))
        .find(message => message.includes('Signaux Delivery combinés'))
      expect(combined).toBeUndefined()
      logSpy.mockRestore()
    })
  })

  describe('update — le versioning (#2916, #2399.6/.7)', () => {
    it('un nouvel abonnement NAÎT à jour — il vient de voir la version courante', async () => {
      subscriptions.findOne.mockResolvedValue(null)
      await service.update('u1', 'daily_briefing', { enabled: true })
      expect(subscriptions.save).toHaveBeenCalledWith(expect.objectContaining({ seen_version: 2 }))
    })

    it('un simple réglage (heure, canal…) ne marque JAMAIS une version comme vue', async () => {
      subscriptions.findOne.mockResolvedValue({
        id: 'sub-1',
        enabled: true,
        hour: 8,
        weekday: null,
        channel: 'email',
        time_zone: 'Europe/Paris',
        seen_version: 0,
      })
      await service.update('u1', 'daily_briefing', { hour: 9 })
      expect(subscriptions.save).toHaveBeenCalledWith(expect.objectContaining({ hour: 9, seen_version: 0 }))
    })

    it('`acknowledgeVersion` acquitte la version ACTUELLE du catalogue, jamais une valeur du client', async () => {
      subscriptions.findOne.mockResolvedValue({
        id: 'sub-1',
        enabled: true,
        hour: 8,
        weekday: null,
        channel: 'email',
        time_zone: 'Europe/Paris',
        seen_version: 0,
      })
      await service.update('u1', 'daily_briefing', { acknowledgeVersion: true })
      expect(subscriptions.save).toHaveBeenCalledWith(expect.objectContaining({ seen_version: 2 }))
    })
  })

  /**
   * #2843 (#2205.45) — le plafond de destinataires, DISTINCT de la cible
   * calculée. Réglable UNIQUEMENT sur `no_reply_follow_up`, la seule routine
   * où le calcul de la cible est déjà séparé de l'écriture.
   */
  describe('update — le plafond de destinataires (#2205.45)', () => {
    it('persiste `maxItemsPerRun` pour `no_reply_follow_up`', async () => {
      subscriptions.findOne.mockResolvedValue(null)
      await service.update('u1', 'no_reply_follow_up', { maxItemsPerRun: 3 })
      expect(subscriptions.save).toHaveBeenCalledWith(expect.objectContaining({ max_items_per_run: 3 }))
    })

    it('un simple réglage (heure…) ne touche jamais un plafond déjà réglé', async () => {
      subscriptions.findOne.mockResolvedValue({
        id: 'sub-1',
        routine_key: 'no_reply_follow_up',
        status: 'active',
        enabled: true,
        hour: 8,
        weekday: null,
        channel: 'in_app',
        time_zone: 'Europe/Paris',
        seen_version: 1,
        max_items_per_run: 2,
      })
      await service.update('u1', 'no_reply_follow_up', { hour: 9 })
      expect(subscriptions.save).toHaveBeenCalledWith(expect.objectContaining({ hour: 9, max_items_per_run: 2 }))
    })

    it('`maxItemsPerRun: null` efface un plafond déjà réglé — retour au défaut', async () => {
      subscriptions.findOne.mockResolvedValue({
        id: 'sub-1',
        routine_key: 'no_reply_follow_up',
        status: 'active',
        enabled: true,
        hour: 8,
        weekday: null,
        channel: 'in_app',
        time_zone: 'Europe/Paris',
        seen_version: 1,
        max_items_per_run: 4,
      })
      await service.update('u1', 'no_reply_follow_up', { maxItemsPerRun: null })
      expect(subscriptions.save).toHaveBeenCalledWith(expect.objectContaining({ max_items_per_run: null }))
    })

    it('refuse un plafond pour toute routine AUTRE que `no_reply_follow_up` — pas de réglage mort', async () => {
      await expect(service.update('u1', 'daily_briefing', { maxItemsPerRun: 3 })).rejects.toThrow(/plafond/i)
      expect(subscriptions.save).not.toHaveBeenCalled()
    })
  })

  /**
   * #2398.7 — les six statuts. `status` devient la vérité écrite ; `enabled`
   * n'est plus qu'un miroir dérivé (GA-26 : jamais deux réglages
   * indépendants pour la même décision).
   */
  describe('#2398.7 — le statut à six valeurs', () => {
    it('écrit `status` et maintient `enabled` en miroir', async () => {
      subscriptions.findOne.mockResolvedValue({
        routine_key: 'daily_briefing',
        status: 'active',
        enabled: true,
        hour: 8,
        weekday: null,
        channel: 'in_app',
        time_zone: 'Europe/Paris',
      })
      // `update` relit via `list()` après écriture : le mock de `find` doit
      // donc rendre la ligne telle que `save` l'aurait persistée, sinon le
      // test vérifierait l'écriture sans vérifier ce que l'écran reçoit.
      subscriptions.find.mockResolvedValue([
        {
          routine_key: 'daily_briefing',
          status: 'disabled',
          enabled: false,
          hour: 8,
          weekday: null,
          channel: 'in_app',
          time_zone: 'Europe/Paris',
        },
      ])

      const view = await service.update('u1', 'daily_briefing', { status: 'disabled' })

      expect(subscriptions.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'disabled', enabled: false }))
      expect(view.subscription.status).toBe('disabled')
      expect(view.subscription.enabled).toBe(false)
    })

    it('accepte encore `enabled` (chemin déprécié) et le traduit en statut', async () => {
      subscriptions.findOne.mockResolvedValue({
        routine_key: 'daily_briefing',
        status: 'paused',
        enabled: false,
        hour: 8,
        weekday: null,
        channel: 'in_app',
        time_zone: 'Europe/Paris',
      })
      subscriptions.find.mockResolvedValue([
        {
          routine_key: 'daily_briefing',
          status: 'active',
          enabled: true,
          hour: 8,
          weekday: null,
          channel: 'in_app',
          time_zone: 'Europe/Paris',
        },
      ])

      const view = await service.update('u1', 'daily_briefing', { enabled: true })

      expect(view.subscription.status).toBe('active')
      expect(view.subscription.enabled).toBe(true)
    })

    it('refuse un statut non réglable depuis cet écran (draft/error/deprecated)', async () => {
      await expect(service.update('u1', 'daily_briefing', { status: 'error' })).rejects.toThrow(/statut/i)
    })

    it('dérive `status` de `enabled` pour une ligne écrite avant la migration', async () => {
      subscriptions.find.mockResolvedValue(
        ROUTINE_CATALOG.map(definition => ({
          routine_key: definition.key,
          enabled: true,
          hour: 8,
          weekday: definition.defaultWeekday,
          channel: 'in_app',
          time_zone: 'Europe/Paris',
        })),
      )

      const views = await service.list('u1')

      expect(views.every(view => view.subscription.status === 'active')).toBe(true)
    })
  })
})

/**
 * La routine de santé n'a JAMAIS notifié personne (PDF 7, défaut n°8).
 *
 * Elle rend des `items[]` — un par couple outil/état — sans `notification` de
 * haut niveau. Or `runDue` ne notifie que sur `outcome.notification`, et les
 * `items` ne sont lus que par `runContinuous`, réservé à `cadence ===
 * 'continuous'`. Déclarée `daily`, elle tournait chaque matin, marquait sa
 * trace du jour, et se taisait. Un an de « tout va bien » qui ne voulait rien
 * dire.
 */
describe('RoutinesService — la santé des connecteurs notifie enfin', () => {
  const subscriptions = { find: jest.fn(), findOne: jest.fn(), insert: jest.fn(), save: jest.fn(), create: jest.fn() }
  const runs = { find: jest.fn(), findOne: jest.fn(), query: jest.fn(), insert: jest.fn(), update: jest.fn() }
  const notifications = { createNotification: jest.fn(), createProactiveBatch: jest.fn() }
  const executors = { run: jest.fn() }
  let service: RoutinesService

  beforeEach(async () => {
    jest.resetAllMocks()
    subscriptions.findOne.mockResolvedValue(null)
    subscriptions.create.mockImplementation((value: unknown) => value)
    subscriptions.save.mockResolvedValue(undefined)
    runs.findOne.mockResolvedValue(null)
    runs.insert.mockResolvedValue(undefined)
    runs.update.mockResolvedValue(undefined)
    // Seule la routine de santé est abonnée, et elle est due.
    subscriptions.find.mockResolvedValue([
      {
        user_id: 'u1',
        routine_key: 'connector_health',
        enabled: true,
        hour: 8,
        weekday: null,
        time_zone: 'Europe/Paris',
      },
    ])
    executors.run.mockResolvedValue({
      notified: true,
      outcome: '1 outil à reconnecter.',
      priority: 80,
      items: [
        {
          objectId: 'crm:authorization_expired',
          outcome: 'crm — authorization_expired',
          priority: 80,
          notification: { title: 'Ton CRM ne répond plus', body: 'Reconnecte-le.', link: '/integrations' },
        },
      ],
    })

    const moduleRef = await Test.createTestingModule({
      providers: [
        RoutinesService,
        { provide: getRepositoryToken(RoutineSubscriptionEntity), useValue: subscriptions },
        { provide: getRepositoryToken(RoutineRunEntity), useValue: runs },
        { provide: getRepositoryToken(AccountEntity), useValue: { count: jest.fn().mockResolvedValue(1) } },
        { provide: NotificationsService, useValue: notifications },
        { provide: RoutineExecutors, useValue: executors },
        { provide: MailboxService, useValue: { status: jest.fn().mockResolvedValue({ connected: false }) } },
        { provide: AgendaService, useValue: { status: jest.fn().mockResolvedValue({ connected: false }) } },
        { provide: AtsService, useValue: { status: jest.fn().mockResolvedValue({ connected: false }) } },
        { provide: CrmService, useValue: { isConnected: jest.fn().mockResolvedValue(false) } },
        {
          provide: WorkspaceContextService,
          useValue: { isDemoWorkspace: jest.fn().mockResolvedValue(false) },
        },
      ],
    }).compile()
    service = moduleRef.get(RoutinesService)
  })

  it('envoie la notification que la cadence `daily` avalait', async () => {
    await service.runDueFor('u1', new Date('2026-08-21T08:05:00.000Z'))
    expect(notifications.createNotification).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ title: 'Ton CRM ne répond plus', link: '/integrations' }),
    )
  })

  it('réserve son occurrence sur l’ÉTAT et non sur la date', async () => {
    // « Ce jeton a expiré » ne se redit pas demain ; « il a expiré à nouveau
    // après réparation » se redit. Une clé datée ferait exactement l'inverse.
    await service.runDueFor('u1', new Date('2026-08-21T08:05:00.000Z'))
    const key = (runs.insert.mock.calls[0]?.[0] as { run_key: string }).run_key
    expect(key).toContain('crm:authorization_expired')
    expect(key).not.toMatch(/2026-08-21/)
  })
})
