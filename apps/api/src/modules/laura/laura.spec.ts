import { LauraController } from './laura.controller'
import { GOLDEN_MOMENT_COUNTS, type DetectionCount } from './laura-detector'
import { LauraService } from './laura.service'

describe('D50 — l’alerte équipe atteint enfin un écran', () => {
  const service = () => new LauraService({} as never, {} as never, {} as never, {} as never)

  it('se déclenche sur un espace critique', () => {
    // Le verdict était calculé et testé depuis le 22/08 sans aucun appelant :
    // le signal de churn le plus actionnable du produit n'atteignait personne.
    const critical = service().health({
      activation: 0,
      connectors: 0,
      dataDensity: 0,
      teamAdoption: 0.2,
      depth: 0,
      consumption: 0,
      quality: 0,
      actionability: 0,
      value: 0,
    })
    expect(critical.reading).toBe('critical')
    expect(service().alertsTeam(critical)).toBe(true)
  })

  it('n’alerte JAMAIS sans score — un espace créé hier ressemble à un espace qu’on perd', () => {
    const unknown = service().health({
      activation: null,
      connectors: null,
      dataDensity: null,
      teamAdoption: null,
      depth: null,
      consumption: null,
      quality: null,
      actionability: null,
      value: null,
    })
    expect(unknown.score).toBeNull()
    expect(service().alertsTeam(unknown)).toBe(false)
  })

  it('n’alerte pas sur un espace simplement à surveiller', () => {
    const watch = service().health({
      activation: 0.7,
      connectors: 0.8,
      dataDensity: 0.6,
      teamAdoption: 0.5,
      depth: 0.4,
      consumption: 0.5,
      quality: 0.6,
      actionability: 0.5,
      value: 0.5,
    })
    expect(service().alertsTeam(watch)).toBe(false)
  })
})

/**
 * LE DERNIER MAILLON — celui qui manque toujours.
 *
 * Le budget adaptatif et les moments d'or peuvent être justes, testés et
 * complets : s'ils ne franchissent pas le contrôleur, ils n'existent pas. C'est
 * le défaut n°1 du dépôt, et il se prouve ici sur les ARGUMENTS réellement
 * passés — un mock qui les jette laisserait la garde verte.
 */
describe('le contrôleur BRANCHE le budget sur le chemin d’envoi', () => {
  const NO_HEALTH = {
    activation: null,
    connectors: null,
    dataDensity: null,
    teamAdoption: null,
    depth: null,
    consumption: null,
    quality: null,
  }

  function harness(options: {
    blocking: string[] | null
    counts: Record<string, number | null>
    longBenchCost?: unknown
    missionStart?: unknown
  }) {
    const plan = jest.fn().mockResolvedValue({ speaks: false, reason: 'nothing_to_say' })
    const countsCall = jest.fn().mockResolvedValue(options.counts)
    const longestBenchConsultant = jest.fn().mockResolvedValue(options.longBenchCost ?? null)
    const nearestMissionStartNotReady = jest.fn().mockResolvedValue(options.missionStart ?? null)
    const laura = {
      plan,
      health: jest.fn().mockReturnValue({ score: null, reading: 'unknown', evaluated: [], notEvaluable: [] }),
      alertsTeam: jest.fn().mockReturnValue(false),
    }
    const probe = {
      measureCached: jest.fn().mockResolvedValue(NO_HEALTH),
      blockingIssues: jest.fn().mockResolvedValue(options.blocking),
      counts: countsCall,
      billingWindow: jest.fn().mockResolvedValue(null),
      longestBenchConsultant,
      nearestMissionStartNotReady,
    }
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w1' }),
      isDemoWorkspace: jest.fn(async () => false),
    }
    // #2403.13 — aucune réunion connue dans ces scénarios : `listEvents` vide,
    // byte-identique au comportement d'avant ce point (`busy` ne vient que du
    // corps de la requête).
    const agenda = { listEvents: jest.fn().mockResolvedValue([]) }
    const planFeatures = { featuresForWorkspace: jest.fn().mockResolvedValue([]) }
    const controller = new LauraController(
      laura as never,
      probe as never,
      workspaceContext as never,
      agenda as never,
      planFeatures as never,
    )
    return { controller, plan, countsCall, longestBenchConsultant, nearestMissionStartNotReady }
  }

  it('demande les mesures du budget sur un écran qui n’en a AUCUN besoin par lui-même', async () => {
    // Sans ça, la dérogation ne s'ouvrirait que sur les écrans dont un
    // détecteur réclame déjà ces mesures — un trou parfaitement silencieux,
    // une mesure non demandée valant `null`, et un `null` ne déclenchant rien.
    const { controller, countsCall } = harness({ blocking: [], counts: {} })
    await controller.plan({ userId: 'u1' } as never, { screen: '/journal', busy: false })
    const asked = countsCall.mock.calls[0]?.[2] as DetectionCount[]
    expect(asked).toEqual(expect.arrayContaining([...GOLDEN_MOMENT_COUNTS]))
  })

  it('passe le moment d’or DÉTECTÉ, et la sollicitation d’hier MESURÉE', async () => {
    const { controller, plan } = harness({
      blocking: ['La connexion à ton CRM a expiré.'],
      counts: { spontaneousQueriesYesterday: 7 },
    })
    await controller.plan({ userId: 'u1' } as never, { screen: '/dashboard', busy: false })
    expect(plan).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ goldenMoment: 'real_blocker', spontaneousQueriesYesterday: 7 }),
    )
  })

  it('une sollicitation NON MESURÉE voyage en `null`, jamais en « 0 »', async () => {
    // Un `0` ici ferait dire au calcul « elle n'a rien demandé hier » de
    // quelqu'un dont on n'a simplement pas su lire les messages.
    const { controller, plan } = harness({ blocking: [], counts: { spontaneousQueriesYesterday: null } })
    await controller.plan({ userId: 'u1' } as never, { screen: '/dashboard', busy: false })
    expect(plan).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ goldenMoment: null, spontaneousQueriesYesterday: null }),
    )
  })

  /**
   * LE COÛT DE L'INTERCONTRAT ATTEINT `plan()` — le même défaut que ce fichier
   * corrige déjà pour le budget : un calcul juste, testé, dont personne ne
   * vérifie qu'il traverse le contrôleur ne traverse rien.
   */
  it('mesure le coût de l’intercontrat SEULEMENT quand `long_bench` est déjà candidate, et le PASSE à `plan`', async () => {
    const { controller, plan, longestBenchConsultant } = harness({
      blocking: [],
      counts: { consultantsOnLongBench: 1 },
      longBenchCost: { measurable: true, amountCents: 1_350_000 },
    })
    await controller.plan({ userId: 'u1' } as never, { screen: '/consultants', busy: false })
    expect(longestBenchConsultant).toHaveBeenCalledWith('w1')
    expect(plan).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ longBenchCost: { measurable: true, amountCents: 1_350_000 } }),
    )
  })

  it('ne mesure PAS le coût de l’intercontrat quand `long_bench` n’est pas candidate — pas de lecture pour rien', async () => {
    const { controller, longestBenchConsultant, plan } = harness({
      blocking: [],
      counts: { consultantsOnLongBench: 0 },
    })
    await controller.plan({ userId: 'u1' } as never, { screen: '/consultants', busy: false })
    expect(longestBenchConsultant).not.toHaveBeenCalled()
    expect(plan).toHaveBeenCalledWith('u1', expect.objectContaining({ longBenchCost: null }))
  })

  // #2409.8 — les manques NOMMÉS du démarrage traversent le contrôleur, et ne
  // se lisent que quand `mission_start_not_ready` est déjà candidate.
  it('lit la mission la plus proche d’un démarrage incomplet SEULEMENT quand son intervention est candidate', async () => {
    const START = {
      missionId: 'm-1',
      label: 'Renfort',
      startsOn: '2026-10-01',
      verdict: 'blocked',
      missing: ['consultant_agreement'],
      reserves: [],
    }
    const on = harness({ blocking: [], counts: { missionsStartingSoonNotReady: 1 }, missionStart: START })
    await on.controller.plan({ userId: 'u1' } as never, { screen: '/missions', busy: false })
    expect(on.nearestMissionStartNotReady).toHaveBeenCalledWith('w1')
    expect(on.plan).toHaveBeenCalledWith('u1', expect.objectContaining({ missionStart: START }))

    const off = harness({ blocking: [], counts: { missionsStartingSoonNotReady: 0 }, missionStart: START })
    await off.controller.plan({ userId: 'u1' } as never, { screen: '/missions', busy: false })
    expect(off.nearestMissionStartNotReady).not.toHaveBeenCalled()
    expect(off.plan).toHaveBeenCalledWith('u1', expect.objectContaining({ missionStart: null }))
  })
})
