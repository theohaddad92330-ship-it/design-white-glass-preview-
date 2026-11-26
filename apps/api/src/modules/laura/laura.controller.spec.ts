import { Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { WorkspaceHealth } from '@bellum/contracts'
import { AgendaService } from '../agenda/agenda.service'
import { PlanFeaturesService } from '../plan-features/plan-features.service'
import { TelephonyService } from '../telephony/telephony.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { LauraController } from './laura.controller'
import { LauraProbeService } from './laura-probe.service'
import { LauraService } from './laura.service'

/**
 * #2403.13 — LA VARIANTE CONFORME, AU NIVEAU DU CONTRÔLEUR.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `agent_docs/doctrine.md:19` (« JAMAIS de donnée fictive ») bloquait « aucune
 * intervention pendant une réunion EN COURS » tel qu'écrit : ce dépôt n'a
 * aucune source d'état LIVE. Ce test défend la variante qui livre quand même
 * l'intention, sans l'inventer : `LauraController.plan` lit l'agenda déjà
 * SYNCHRONISÉ (`AgendaService.listEvents`) et compare `now` au début/fin d'un
 * rendez-vous CONNU (`hasMeetingInProgress`, `@bellum/contracts`) — jamais un
 * « appel en cours » qui n'existe nulle part.
 *
 * Écran volontairement HORS catalogue (`/ecran-de-test-sans-detecteur`) : la
 * détection retombe sur des listes vides, et ce test isole donc UNE chose —
 * le calcul de `busy` transmis à `LauraService.plan` — sans avoir à simuler
 * les 26 détecteurs du catalogue.
 */
describe('LauraController.plan — #2403.13, réunion en cours = variante conforme au synced agenda', () => {
  const laura = { health: jest.fn(), alertsTeam: jest.fn(), plan: jest.fn() }
  const probe = {
    measureCached: jest.fn(),
    blockingIssues: jest.fn(),
    counts: jest.fn(),
    billingWindow: jest.fn(),
    accountHiringSignals: jest.fn(),
    accountPainFacts: jest.fn(),
    nearestMissionStartNotReady: jest.fn(),
    longestBenchConsultant: jest.fn(),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(), isDemoWorkspace: jest.fn(async () => false) }
  const agenda = { listEvents: jest.fn() }
  const planFeatures = { featuresForWorkspace: jest.fn() }

  let controller: LauraController

  const HEALTH = {
    score: 100,
    reading: 'sain',
    mainCause: null,
    evaluated: [],
    notEvaluable: [],
  } as unknown as WorkspaceHealth
  const SCREEN = '/ecran-de-test-sans-detecteur'
  const USER = { userId: 'u1', email: 'u1@example.com' }

  beforeEach(async () => {
    jest.resetAllMocks()
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w1' })
    probe.measureCached.mockResolvedValue({})
    probe.blockingIssues.mockResolvedValue(null)
    probe.counts.mockResolvedValue({})
    planFeatures.featuresForWorkspace.mockResolvedValue([])
    laura.health.mockReturnValue(HEALTH)
    laura.alertsTeam.mockReturnValue(false)
    laura.plan.mockResolvedValue({ speaks: false, reason: 'nothing_to_say' })

    const moduleRef = await Test.createTestingModule({
      controllers: [LauraController],
      providers: [
        { provide: LauraService, useValue: laura },
        { provide: LauraProbeService, useValue: probe },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: AgendaService, useValue: agenda },
        { provide: PlanFeaturesService, useValue: planFeatures },
      ],
    }).compile()

    controller = moduleRef.get(LauraController)
  })

  it("un rendez-vous CONFIRMÉ dont `now` tombe dans l'intervalle coupe Laura, même si le navigateur envoie `busy: false`", async () => {
    const now = new Date('2026-09-27T14:30:00.000Z')
    jest.useFakeTimers().setSystemTime(now)
    agenda.listEvents.mockResolvedValue([
      {
        id: 'evt-1',
        summary: 'Point client',
        description: null,
        location: null,
        start: '2026-09-27T14:00:00.000Z',
        end: '2026-09-27T15:00:00.000Z',
        organizer: null,
        attendees: [],
        conferenceUrl: null,
        webUrl: null,
        status: 'confirmed',
        isExternal: true,
        cancelled: false,
      },
    ])

    await controller.plan(USER, { screen: SCREEN, busy: false })

    expect(laura.plan).toHaveBeenCalledWith('u1', expect.objectContaining({ busy: true }))
    jest.useRealTimers()
  })

  // #4458 (Louis, tri Sentry 22/10/2026) — un espace en risque de churn est un signal MÉTIER, pas une panne :
  // `warn` (journaux), plus une exception Sentry. Le comportement (une alerte par espace et par jour) ne change pas.
  it('#4458 — le churn critique part en warn, jamais en error', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation()
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation()
    agenda.listEvents.mockResolvedValue([])
    laura.alertsTeam.mockReturnValue(true)

    await controller.plan(USER, { screen: SCREEN, busy: false })

    const churn = (spy: jest.SpyInstance) => spy.mock.calls.filter(call => String(call[0]).includes('churn critique'))
    expect(churn(warn)).toHaveLength(1)
    expect(churn(error)).toEqual([])
    warn.mockRestore()
    error.mockRestore()
  })

  // Sentry BELLUM-API-G — N+1 `pg-pool.connect` sur POST /laura/plan : la lecture « espace de démo » partait
  // APRÈS les lectures parallèles, une prise de pool de plus en série. Elle est indépendante : avec elles.
  it('BELLUM-API-G — la lecture « espace de démo » part avec les autres lectures, pas après', async () => {
    agenda.listEvents.mockResolvedValue([])
    let demoReadWhenMeasureSettled: boolean | null = null
    probe.measureCached.mockImplementation(
      () =>
        new Promise(resolve =>
          setTimeout(() => {
            demoReadWhenMeasureSettled = workspaceContext.isDemoWorkspace.mock.calls.length > 0
            resolve({})
          }, 10),
        ),
    )
    workspaceContext.isDemoWorkspace.mockResolvedValue(true)

    await controller.plan(USER, { screen: SCREEN, busy: false })

    expect(demoReadWhenMeasureSettled).toBe(true)
    expect(laura.plan).toHaveBeenCalledWith('u1', expect.objectContaining({ demo: true }))
  })

  it('#3939.3 — le dossier ouvert lit la douleur sourcée ; le recrutement illisible ne la fait pas taire', async () => {
    agenda.listEvents.mockResolvedValue([])
    const accountId = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'
    const facts = [
      { kind: 'pain_hypothesis', statement: 'Arbitrage budgétaire', source: null, observedOn: null, count: null },
      { kind: 'pain_signal', statement: 'Plan annoncé', source: null, observedOn: '2026-07', count: null },
    ]
    probe.accountHiringSignals.mockResolvedValue(null)
    probe.accountPainFacts.mockResolvedValue(facts)

    await controller.plan(USER, { screen: `/accounts/${accountId}`, busy: false, accountId })

    expect(probe.accountPainFacts).toHaveBeenCalledWith('w1', accountId)
    expect(laura.plan).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        candidateKeys: expect.arrayContaining(['account_pain_with_dated_signal']),
        painSuggestion: { accountId, facts, resource: null },
      }),
    )
  })

  it('#3939.3 — sait dire NON : aucune douleur fondée = aucune candidate, aucune suggestion', async () => {
    agenda.listEvents.mockResolvedValue([])
    const accountId = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'
    probe.accountHiringSignals.mockResolvedValue([])
    probe.accountPainFacts.mockResolvedValue([])

    await controller.plan(USER, { screen: `/accounts/${accountId}`, busy: false, accountId })

    const options = laura.plan.mock.calls.at(-1)?.[1] as { candidateKeys: string[]; painSuggestion: unknown }
    expect(options.candidateKeys).not.toContain('account_pain_with_dated_signal')
    expect(options.painSuggestion).toBeNull()
  })

  it('aucun rendez-vous en cours : `busy` reste celui envoyé par le navigateur', async () => {
    agenda.listEvents.mockResolvedValue([])

    await controller.plan(USER, { screen: SCREEN, busy: false })

    expect(laura.plan).toHaveBeenCalledWith('u1', expect.objectContaining({ busy: false }))
  })

  it('aucun agenda connecté (lecture en échec) : `busy` ne bascule jamais sur une supposition', async () => {
    agenda.listEvents.mockRejectedValue(new Error('Aucun agenda connecté.'))

    await controller.plan(USER, { screen: SCREEN, busy: false })

    expect(laura.plan).toHaveBeenCalledWith('u1', expect.objectContaining({ busy: false }))
  })

  it('un rendez-vous seulement PROPOSÉ (tentative) ne coupe pas Laura — pas un engagement pris', async () => {
    const now = new Date('2026-09-27T14:30:00.000Z')
    jest.useFakeTimers().setSystemTime(now)
    agenda.listEvents.mockResolvedValue([
      {
        id: 'evt-2',
        summary: 'Point client (à confirmer)',
        description: null,
        location: null,
        start: '2026-09-27T14:00:00.000Z',
        end: '2026-09-27T15:00:00.000Z',
        organizer: null,
        attendees: [],
        conferenceUrl: null,
        webUrl: null,
        status: 'tentative',
        isExternal: true,
        cancelled: false,
      },
    ])

    await controller.plan(USER, { screen: SCREEN, busy: false })

    expect(laura.plan).toHaveBeenCalledWith('u1', expect.objectContaining({ busy: false }))
    jest.useRealTimers()
  })
})

/**
 * #2403.12 — LA SOURCE « APPEL EN COURS », AU NIVEAU DU CONTRÔLEUR.
 *
 * L'agenda (#2403.13) reste le REPLI : ces tests isolent la source PRIMAIRE,
 * posée par le webhook signé (`TelephonyService.isCallInProgress`), lue en
 * `@Optional()` — retirer le module téléphonie ne doit jamais faire échouer
 * `plan`, seulement faire retomber `busy` sur l'agenda seul.
 */
describe('LauraController.plan — #2403.12, appel en cours = source primaire, l’agenda reste le repli', () => {
  const laura = { health: jest.fn(), alertsTeam: jest.fn(), plan: jest.fn() }
  const probe = {
    measureCached: jest.fn(),
    blockingIssues: jest.fn(),
    counts: jest.fn(),
    billingWindow: jest.fn(),
    accountHiringSignals: jest.fn(),
    accountPainFacts: jest.fn(),
    nearestMissionStartNotReady: jest.fn(),
    longestBenchConsultant: jest.fn(),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(), isDemoWorkspace: jest.fn(async () => false) }
  const agenda = { listEvents: jest.fn() }
  const telephony = { isCallInProgress: jest.fn() }
  const planFeatures = { featuresForWorkspace: jest.fn() }

  let controller: LauraController

  const HEALTH = {
    score: 100,
    reading: 'sain',
    mainCause: null,
    evaluated: [],
    notEvaluable: [],
  } as unknown as WorkspaceHealth
  const SCREEN = '/ecran-de-test-sans-detecteur'
  const USER = { userId: 'u1', email: 'u1@example.com' }

  beforeEach(async () => {
    jest.resetAllMocks()
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w1' })
    probe.measureCached.mockResolvedValue({})
    probe.blockingIssues.mockResolvedValue(null)
    probe.counts.mockResolvedValue({})
    agenda.listEvents.mockResolvedValue([])
    planFeatures.featuresForWorkspace.mockResolvedValue([])
    laura.health.mockReturnValue(HEALTH)
    laura.alertsTeam.mockReturnValue(false)
    laura.plan.mockResolvedValue({ speaks: false, reason: 'nothing_to_say' })

    const moduleRef = await Test.createTestingModule({
      controllers: [LauraController],
      providers: [
        { provide: LauraService, useValue: laura },
        { provide: LauraProbeService, useValue: probe },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: AgendaService, useValue: agenda },
        { provide: PlanFeaturesService, useValue: planFeatures },
        { provide: TelephonyService, useValue: telephony },
      ],
    }).compile()

    controller = moduleRef.get(LauraController)
  })

  it('un appel EN COURS coupe Laura, même si le navigateur envoie `busy: false` et sans rendez-vous connu', async () => {
    telephony.isCallInProgress.mockResolvedValue(true)

    await controller.plan(USER, { screen: SCREEN, busy: false })

    expect(telephony.isCallInProgress).toHaveBeenCalledWith('w1', 'u1', expect.any(Date))
    expect(laura.plan).toHaveBeenCalledWith('u1', expect.objectContaining({ busy: true }))
  })

  it('aucun appel en cours : `busy` reste celui envoyé par le navigateur', async () => {
    telephony.isCallInProgress.mockResolvedValue(false)

    await controller.plan(USER, { screen: SCREEN, busy: false })

    expect(laura.plan).toHaveBeenCalledWith('u1', expect.objectContaining({ busy: false }))
  })

  it('une lecture en échec (état illisible) ne bascule jamais `busy` sur une supposition', async () => {
    telephony.isCallInProgress.mockRejectedValue(new Error('base indisponible'))

    await controller.plan(USER, { screen: SCREEN, busy: false })

    expect(laura.plan).toHaveBeenCalledWith('u1', expect.objectContaining({ busy: false }))
  })

  it('sans module téléphonie (`@Optional()` non fourni), `plan` ne casse jamais — repli sur l’agenda seul', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LauraController],
      providers: [
        { provide: LauraService, useValue: laura },
        { provide: LauraProbeService, useValue: probe },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: AgendaService, useValue: agenda },
        { provide: PlanFeaturesService, useValue: planFeatures },
      ],
    }).compile()
    const controllerSansTelephonie = moduleRef.get(LauraController)

    await expect(controllerSansTelephonie.plan(USER, { screen: SCREEN, busy: false })).resolves.toBeDefined()
    expect(laura.plan).toHaveBeenCalledWith('u1', expect.objectContaining({ busy: false }))
  })
})
