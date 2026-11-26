import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { SINCE_LAST_VISIT_LINES, sinceLastVisitDigestSchema } from '@bellum/contracts'
import type { SinceLastVisitLine, SinceLastVisitLineKind } from '@bellum/contracts'
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
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { BriefingService } from './briefing.service'
import { signalsDetectedSince } from './since-last-visit'

/**
 * LES QUATRE LIGNES DE « CE QUI A BOUGÉ DEPUIS TA DERNIÈRE VISITE ».
 *
 * Ce que ces tests défendent tient en une phrase : **une valeur absente ne
 * s'affiche JAMAIS « 0 »**. Chaque ligne est vérifiée dans ses TROIS états —
 * une valeur, rien à dire, non mesurable — parce que ce sont trois gestes
 * différents pour le commercial, et qu'un « 0 » les confond tous les trois.
 *
 * Le bloc a déjà été marqué « branché et vu à l'écran » alors que son contenu
 * n'existait pas : un test qui monte le composant ne prouve rien. Ceux-ci
 * lisent des CHIFFRES.
 *
 * #2803 (#2389.4) — la cinquième ligne, `attack_angles_added` : « Opportunités »
 * n'avait aucune ligne, `attack_angles` n'ayant 0 référence dans
 * `modules/briefing/`. Même pattern que les quatre autres : lecture directe du
 * SCHÉMA (`AttackAngleEntity`), pas du service voisin — GA-07 est au plafond.
 *
 * #2803 (#2389.4) — la sixième ligne, `night_routines_run` : « Travaux
 * nocturnes » compte les exécutions de routine `notified: true`, même pattern
 * GA-07 (lecture directe de `RoutineRunEntity`, pas de `RoutinesModule`).
 */
describe('BriefingService — depuis ta dernière visite', () => {
  const agenda = { status: jest.fn(), listEvents: jest.fn(), listEventsDetailed: jest.fn() }
  const mailbox = { status: jest.fn(), search: jest.fn() }
  const signalHistory = { listForWorkspace: jest.fn(), queryForWorkspace: jest.fn() }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(), isDemoWorkspace: jest.fn() }
  const accounts = { find: jest.fn() }
  const profiles = { findOne: jest.fn() }
  const activities = { count: jest.fn() }
  const contacts = { find: jest.fn() }
  const interventions = { count: jest.fn() }
  const userPreferences = { findOne: jest.fn() }
  const attackAngles = { count: jest.fn() }
  const routineRuns = { count: jest.fn() }
  // #2106.30/.31 — les deux agrégats du résumé condensé s'écrivent avec un
  // QueryBuilder (`.createQueryBuilder().where().andWhere().getCount()`),
  // pas `.count()` : chaque fake expose donc la même chaîne, `getCount`
  // portant le comportement configurable du test. Reconstruite à chaque test
  // (pas au niveau du describe) : `jest.resetAllMocks()` effacerait sinon
  // `mockReturnThis()` en même temps que les autres implémentations.
  let actionPlanItemsGetCount: jest.Mock
  let actionPlanItems: { createQueryBuilder: jest.Mock }
  let userActionsGetCount: jest.Mock
  let userActions: { createQueryBuilder: jest.Mock }

  const SINCE = new Date('2026-08-26T18:04:00.000Z')
  let service: BriefingService

  const mailboxReady = {
    connected: true,
    provider: 'google',
    address: 'moi@bellum.fr',
    capabilities: { read: true, draft: true, send: true, labels: true, outOfOffice: true },
  }

  beforeEach(async () => {
    jest.resetAllMocks()
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws1' })
    signalHistory.queryForWorkspace.mockResolvedValue([])
    mailbox.status.mockResolvedValue(mailboxReady)
    activities.count.mockResolvedValue(0)
    contacts.find.mockResolvedValue([])
    accounts.find.mockResolvedValue([])
    interventions.count.mockResolvedValue(0)
    userPreferences.findOne.mockResolvedValue(null)
    attackAngles.count.mockResolvedValue(0)
    routineRuns.count.mockResolvedValue(0)

    actionPlanItemsGetCount = jest.fn().mockResolvedValue(0)
    actionPlanItems = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: actionPlanItemsGetCount,
      })),
    }
    userActionsGetCount = jest.fn().mockResolvedValue(0)
    userActions = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: userActionsGetCount,
      })),
    }

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
        { provide: getRepositoryToken(ActionPlanItemEntity), useValue: actionPlanItems },
        { provide: getRepositoryToken(UserActionEntity), useValue: userActions },
        { provide: getRepositoryToken(WorkflowRunEntity), useValue: {} },
        { provide: getRepositoryToken(NoteEntity), useValue: {} },
        { provide: getRepositoryToken(AgendaBellumCreatedEventEntity), useValue: {} },
        { provide: getRepositoryToken(FocusPlanBlockOutcomeEntity), useValue: {} },
      ],
    }).compile()

    service = moduleRef.get(BriefingService)
  })

  const lineOf = (lines: SinceLastVisitLine[], kind: SinceLastVisitLineKind) =>
    lines.find(line => line.kind === kind) as SinceLastVisitLine

  it('rend TOUJOURS les six lignes — l’écran ne peut pas deviner une ligne absente', async () => {
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(digest.lines.map(line => line.kind)).toEqual([...SINCE_LAST_VISIT_LINES])
    // Et la réponse respecte SON contrat, invariants compris : c'est le schéma
    // qui interdit « unavailable + count: 0 », pas une relecture humaine.
    expect(() => sinceLastVisitDigestSchema.parse(digest)).not.toThrow()
  })

  /* ------------------------------------------------------------------ */
  /*  1. Signaux sur mes comptes                                        */
  /* ------------------------------------------------------------------ */

  it('compte les signaux ACTIFS de la fenêtre, et les comptes qu’ils touchent', async () => {
    signalHistory.queryForWorkspace.mockResolvedValue([
      { account_id: 'a1', status: 'active', first_detected_at: '2026-08-27T06:00:00.000Z' },
      { account_id: 'a1', status: 'active', first_detected_at: '2026-08-27T07:00:00.000Z' },
      { account_id: 'a2', status: 'active', first_detected_at: '2026-08-27T08:00:00.000Z' },
      // Hors fenêtre, et résolu : ni l'un ni l'autre ne « bouge ».
      { account_id: 'a3', status: 'active', first_detected_at: '2026-08-01T08:00:00.000Z' },
      { account_id: 'a4', status: 'resolved', first_detected_at: '2026-08-27T08:00:00.000Z' },
    ])
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(lineOf(digest.lines, 'account_signals')).toEqual({
      kind: 'account_signals',
      state: 'ready',
      reason: null,
      count: 3,
      scope: 2,
    })
  })

  it('une lecture de signaux qui ÉCHOUE ne rend pas « 0 signal »', async () => {
    // C'est le défaut « cassé et non mesurable se ressemblent » : `listForWorkspace`
    // avale son erreur et rend `[]`, ce qui s'afficherait « rien n'a bougé ».
    signalHistory.queryForWorkspace.mockRejectedValue(new Error('boom'))
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(lineOf(digest.lines, 'account_signals')).toMatchObject({ state: 'unavailable', count: null, scope: null })
  })

  /* ------------------------------------------------------------------ */
  /*  2. Réponses reçues                                                */
  /* ------------------------------------------------------------------ */

  it('compte les messages ENTRANTS de la fenêtre — une métadonnée, jamais un corps', async () => {
    activities.count.mockResolvedValue(2)
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(lineOf(digest.lines, 'replies_received')).toMatchObject({ state: 'ready', count: 2 })

    const where = activities.count.mock.calls[0]?.[0]?.where
    // Scopé à l'espace ET à l'appelant : « on t'a répondu » ne compte pas les
    // réponses reçues par un collègue.
    expect(where).toMatchObject({ workspace_id: 'ws1', user_id: 'u1', direction: 'inbound' })
    // Le CORPS des messages ne sort ni vers un humain ni vers le modèle (D65).
    // Un compteur ne peut pas en laisser fuiter un : il n'en sélectionne aucun.
    expect(JSON.stringify(where)).not.toMatch(/body|snippet|subject/i)
  })

  it('sans messagerie connectée, dit « non connectée » — jamais « 0 réponse »', async () => {
    // « 0 réponse reçue » est VRAI si on a su regarder ; il est FAUX si la
    // messagerie n'est pas branchée. Deux gestes opposés : attendre, ou brancher.
    mailbox.status.mockResolvedValue({ connected: false, provider: null, capabilities: {} })
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(lineOf(digest.lines, 'replies_received')).toEqual({
      kind: 'replies_received',
      state: 'not_connected',
      reason: 'mailbox_not_connected',
      count: null,
      scope: null,
    })
    // Et on ne va surtout pas compter une table qui ne peut rien contenir.
    expect(activities.count).not.toHaveBeenCalled()
  })

  it('distingue une PORTÉE manquante d’une absence de connexion', async () => {
    mailbox.status.mockResolvedValue({ ...mailboxReady, capabilities: { ...mailboxReady.capabilities, read: false } })
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(lineOf(digest.lines, 'replies_received')).toMatchObject({
      state: 'missing_scope',
      reason: 'mailbox_read_scope_missing',
      count: null,
    })
  })

  it('zéro réponse AVEC messagerie branchée est un vrai zéro, et il se dit', async () => {
    activities.count.mockResolvedValue(0)
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(lineOf(digest.lines, 'replies_received')).toMatchObject({ state: 'ready', count: 0 })
  })

  /* ------------------------------------------------------------------ */
  /*  3. Changements de poste                                           */
  /* ------------------------------------------------------------------ */

  const movedContact = {
    id: 'c1',
    account_id: 'a1',
    source: 'apollo',
    entity: null,
    raw_data: { apolloDetails: { organization: 'Nouvelle Société' } },
  }
  const stayedContact = {
    id: 'c2',
    account_id: 'a1',
    source: 'apollo',
    entity: null,
    raw_data: { apolloDetails: { organization: 'ACME' } },
  }

  it('compte les contacts dont l’employeur courant n’est plus le compte', async () => {
    contacts.find.mockResolvedValue([movedContact, stayedContact])
    accounts.find.mockResolvedValue([{ id: 'a1', company_name: 'ACME' }])
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(lineOf(digest.lines, 'job_changes')).toMatchObject({ state: 'ready', count: 1 })
  })

  it('ne regarde que les contacts RÉENRICHIS pendant la fenêtre', async () => {
    await service.sinceLastVisit('u1', SINCE)
    // Sans cette borne, un départ vieux de deux ans remonterait chaque matin
    // dans « depuis ta dernière visite ».
    expect(contacts.find.mock.calls[0]?.[0]?.where?.last_enrichment_at).toBeDefined()
  })

  it('un contact dont le compte est illisible est SAUTÉ, jamais compté comme parti', async () => {
    // `RISQUE` se décide en comparant à un nom de société : comparer à rien
    // rendrait « a changé d'entreprise » pour tout le monde.
    contacts.find.mockResolvedValue([{ ...movedContact, account_id: 'inconnu' }])
    accounts.find.mockResolvedValue([])
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(lineOf(digest.lines, 'job_changes')).toMatchObject({ state: 'ready', count: 0 })
  })

  it('quand la borne de balayage COUPE, ne rend aucun nombre plutôt qu’un total faux', async () => {
    contacts.find.mockResolvedValue(Array.from({ length: 200 }, (_, i) => ({ ...movedContact, id: `c${i}` })))
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(lineOf(digest.lines, 'job_changes')).toMatchObject({
      state: 'partial',
      reason: 'job_changes_truncated',
      count: null,
    })
  })

  /* ------------------------------------------------------------------ */
  /*  4. Missions qui bougent                                           */
  /* ------------------------------------------------------------------ */

  it('compte les alertes de renouvellement OUVERTES pendant la fenêtre', async () => {
    interventions.count.mockResolvedValue(1)
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(lineOf(digest.lines, 'missions_moving')).toMatchObject({ state: 'ready', count: 1 })
    expect(interventions.count.mock.calls[0]?.[0]?.where).toMatchObject({
      workspace_id: 'ws1',
      kind: 'renewal_at_risk',
    })
  })

  it('une lecture d’échéances qui échoue ne rend pas « 0 mission »', async () => {
    interventions.count.mockRejectedValue(new Error('boom'))
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(lineOf(digest.lines, 'missions_moving')).toMatchObject({ state: 'unavailable', count: null })
  })

  /* ------------------------------------------------------------------ */
  /*  5. Opportunités — angles d'attaque ouverts                        */
  /* ------------------------------------------------------------------ */

  it('compte les angles d’attaque créés pendant la fenêtre', async () => {
    attackAngles.count.mockResolvedValue(3)
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(lineOf(digest.lines, 'attack_angles_added')).toMatchObject({ state: 'ready', count: 3 })
    expect(attackAngles.count.mock.calls[0]?.[0]?.where).toMatchObject({ workspace_id: 'ws1' })
  })

  it('une lecture d’angles d’attaque qui échoue ne rend pas « 0 opportunité »', async () => {
    attackAngles.count.mockRejectedValue(new Error('boom'))
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(lineOf(digest.lines, 'attack_angles_added')).toMatchObject({ state: 'unavailable', count: null })
  })

  /* ------------------------------------------------------------------ */
  /*  6. Travaux nocturnes                                              */
  /* ------------------------------------------------------------------ */

  it('compte les routines de nuit qui ont eu quelque chose à dire', async () => {
    routineRuns.count.mockResolvedValue(2)
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(lineOf(digest.lines, 'night_routines_run')).toMatchObject({ state: 'ready', count: 2 })
    expect(routineRuns.count.mock.calls[0]?.[0]?.where).toMatchObject({ user_id: 'u1', notified: true })
  })

  it('une lecture de routines de nuit qui échoue ne rend pas « 0 routine »', async () => {
    routineRuns.count.mockRejectedValue(new Error('boom'))
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(lineOf(digest.lines, 'night_routines_run')).toMatchObject({ state: 'unavailable', count: null })
  })

  /* ------------------------------------------------------------------ */
  /*  Le périmètre                                                      */
  /* ------------------------------------------------------------------ */

  it('sans espace résolu, AUCUNE des six lignes n’est mesurable', async () => {
    workspaceContext.resolveActiveWorkspace.mockRejectedValue(new Error('nope'))
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(digest.lines).toHaveLength(6)
    expect(digest.lines.every(line => line.state === 'unavailable' && line.count === null)).toBe(true)
    // #2106.30/.31 — sans espace résolu, les deux agrégats du résumé condensé
    // ne sont pas mesurables non plus, jamais un zéro fabriqué.
    expect(digest.expiredItemsCount).toBeNull()
    expect(digest.treatedByColleagueCount).toBeNull()
  })

  it('une lecture qui tombe n’efface pas les autres', async () => {
    mailbox.status.mockRejectedValue(new Error('boom'))
    interventions.count.mockResolvedValue(2)
    const digest = await service.sinceLastVisit('u1', SINCE)
    expect(lineOf(digest.lines, 'replies_received')).toMatchObject({ state: 'unavailable' })
    expect(lineOf(digest.lines, 'missions_moving')).toMatchObject({ state: 'ready', count: 2 })
  })

  /* ------------------------------------------------------------------ */
  /*  #2106.30/.31 (épopée #2802) — le résumé condensé de longue absence,  */
  /*  les deux agrégats SERVEUR sur la fenêtre ENTIÈRE                    */
  /* ------------------------------------------------------------------ */

  describe('les deux agrégats du résumé condensé de longue absence', () => {
    it('au-delà du seuil, compte les actions du plan EXPIRÉES (todo, due_date dans la fenêtre)', async () => {
      actionPlanItemsGetCount.mockResolvedValue(4)
      const digest = await service.sinceLastVisit('u1', SINCE)
      expect(digest.expiredItemsCount).toBe(4)
      expect(actionPlanItems.createQueryBuilder).toHaveBeenCalledWith('item')
      const qb = actionPlanItems.createQueryBuilder.mock.results[0].value
      expect(qb.where).toHaveBeenCalledWith('item.user_id = :userId', { userId: 'u1' })
    })

    it('au-delà du seuil, compte ce qu’un AUTRE membre a traité — jamais les lignes tronquées du Journal', async () => {
      userActionsGetCount.mockResolvedValue(7)
      const digest = await service.sinceLastVisit('u1', SINCE)
      expect(digest.treatedByColleagueCount).toBe(7)
      expect(userActions.createQueryBuilder).toHaveBeenCalledWith('action')
      const qb = userActions.createQueryBuilder.mock.results[0].value
      expect(qb.where).toHaveBeenCalledWith('action.workspace_id = :workspaceId', { workspaceId: 'ws1' })
      expect(qb.andWhere).toHaveBeenCalledWith('action.user_id <> :userId', { userId: 'u1' })
    })

    it('sous le seuil de longue absence, ne calcule NI L’UN NI L’AUTRE — pas de requête inutile sur une visite normale', async () => {
      const recentSince = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      const digest = await service.sinceLastVisit('u1', recentSince)
      expect(digest.expiredItemsCount).toBeNull()
      expect(digest.treatedByColleagueCount).toBeNull()
      expect(actionPlanItems.createQueryBuilder).not.toHaveBeenCalled()
      expect(userActions.createQueryBuilder).not.toHaveBeenCalled()
    })

    it('un échec de lecture des actions expirées ne rend pas un zéro fabriqué', async () => {
      actionPlanItemsGetCount.mockRejectedValue(new Error('boom'))
      const digest = await service.sinceLastVisit('u1', SINCE)
      expect(digest.expiredItemsCount).toBeNull()
      // L'échec d'UN agrégat n'efface pas l'autre.
      expect(digest.treatedByColleagueCount).toBe(0)
    })

    it('un échec de lecture du journal des collègues ne rend pas un zéro fabriqué', async () => {
      userActionsGetCount.mockRejectedValue(new Error('boom'))
      const digest = await service.sinceLastVisit('u1', SINCE)
      expect(digest.treatedByColleagueCount).toBeNull()
      expect(digest.expiredItemsCount).toBe(0)
    })

    it('respecte le contrat même quand un agrégat est non mesurable', () => {
      expect(() =>
        sinceLastVisitDigestSchema.parse({
          since: SINCE.toISOString(),
          lines: SINCE_LAST_VISIT_LINES.map(kind => ({ kind, state: 'ready', reason: null, count: 0, scope: null })),
          expiredItemsCount: null,
          treatedByColleagueCount: 3,
        }),
      ).not.toThrow()
    })
  })
})

describe('signalsDetectedSince', () => {
  const since = Date.parse('2026-08-26T18:04:00.000Z')

  it('écarte un signal dont la date de détection est ILLISIBLE', () => {
    // `Number.NaN` comparé à quoi que ce soit est faux : le laisser passer
    // ferait entrer un signal sans date dans « depuis ta dernière visite ».
    expect(
      signalsDetectedSince([{ account_id: 'a1', status: 'active', first_detected_at: 'pas une date' }], since).signals,
    ).toBe(0)
    expect(signalsDetectedSince([{ account_id: 'a1', status: 'active', first_detected_at: null }], since).signals).toBe(
      0,
    )
  })

  it('compte les signaux ET les comptes séparément — « 3 signaux » n’est pas « 3 clients »', () => {
    const result = signalsDetectedSince(
      [
        { account_id: 'a1', status: 'active', first_detected_at: '2026-08-27T06:00:00.000Z' },
        { account_id: 'a1', status: 'active', first_detected_at: '2026-08-27T07:00:00.000Z' },
      ],
      since,
    )
    expect(result).toEqual({ signals: 2, accountIds: new Set(['a1']) })
  })
})
