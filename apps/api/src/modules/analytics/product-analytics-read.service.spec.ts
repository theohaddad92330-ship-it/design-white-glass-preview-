import { MIN_DISTINCT_SESSIONS_FOR_A_METRIC } from '@bellum/contracts'
import { createMockRepository } from '../../database/test-utils'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import {
  ProductAnalyticsReadService,
  groupBySession,
  onboardingQuestionAbandonment,
  reconstructViews,
  withheldBelowThreshold,
  type BehavioralRow,
} from './product-analytics-read.service'

const BASE = Date.parse('2026-09-09T09:00:00.000Z')

type Seeded = { eventName: string; sessionId: string; occurredAt: Date; properties: Record<string, unknown> }

function event(
  eventName: string,
  sessionId: string,
  offsetMs: number,
  properties: Record<string, unknown> = {},
): Seeded {
  return { eventName, sessionId, occurredAt: new Date(BASE + offsetMs), properties }
}

/** Une session complète : ouverture, séjour, sortie par navigation. */
function visit(sessionId: string, route: string, at: number, durationMs: number, actions = 0): Seeded[] {
  const rows: Seeded[] = [
    event('screen_viewed', sessionId, at, { route, previousViewDurationMs: null, provenance: null }),
  ]
  for (let index = 0; index < actions; index += 1) {
    rows.push(event('action_started', sessionId, at + 100 + index, { action: 'exporter', screen: route }))
  }
  rows.push(event('screen_left', sessionId, at + durationMs, { route, durationMs, leaveMode: 'nav' }))
  return rows
}

/** Le seuil, atteint : cinq sessions distinctes sur le même écran. */
function fiveSessionsOn(route: string, durationMs: number, actions = 0): Seeded[] {
  const rows: Seeded[] = []
  for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
    rows.push(...visit(`s${index}`, route, index * 60_000, durationMs, actions))
  }
  return rows
}

function makeService(rows: Seeded[], familyNames?: string[]) {
  const repo = createMockRepository<ProductEventEntity>()
  repo.manager.query.mockImplementation((sql: string) => {
    if (sql.includes('q:families')) {
      const names = familyNames ?? [...new Set(rows.map(row => row.eventName))]
      return Promise.resolve(names.map(eventName => ({ eventName })))
    }
    if (sql.includes('q:behavioral')) {
      // La vraie requête rend les plus RÉCENTS d'abord — on le reproduit, sinon
      // un test vert ne prouverait rien du tri en mémoire.
      return Promise.resolve([...rows].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()))
    }
    return Promise.resolve([])
  })
  return { service: new ProductAnalyticsReadService(repo as never), repo }
}

describe('withheldBelowThreshold — #1681.1, le seuil appliqué à un seul endroit', () => {
  it('rend `null` au-dessus du seuil — la mesure est publiable', () => {
    expect(withheldBelowThreshold('activationRate', MIN_DISTINCT_SESSIONS_FOR_A_METRIC)).toBeNull()
    expect(withheldBelowThreshold('activationRate', MIN_DISTINCT_SESSIONS_FOR_A_METRIC + 40)).toBeNull()
  })

  it('sous le seuil, il NOMME la mesure et le compte — jamais un zéro', () => {
    const withheld = withheldBelowThreshold('activationRate', 2)
    expect(withheld).toEqual({
      kind: 'below_threshold',
      metric: 'activationRate',
      subjects: 2,
      minSubjects: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    })
    // Le témoin qui compte : la réponse n'est PAS le nombre 0.
    expect(withheld?.subjects).not.toBe(0)
  })

  it('un effectif de zéro reste retenu, et se dit zéro SUJET, pas zéro mesure', () => {
    expect(withheldBelowThreshold('activationRate', 0)?.subjects).toBe(0)
  })

  it('lit le seuil du contrat — il n’est pas recopié ici (GA-26)', () => {
    expect(withheldBelowThreshold('x', MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1)?.minSubjects).toBe(
      MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    )
  })
})

describe('reconstructViews — une session ordonnée devient des vues', () => {
  const rows = (seeded: Seeded[]): BehavioralRow[] => seeded

  it('replie le chemin RÉEL vers son motif — l’identifiant ne survit pas', () => {
    const views = reconstructViews(
      rows([
        event('screen_viewed', 's1', 0, { route: '/accounts/3f1c2a90-7b41-4d0e-9f22-6c8b5e4a1d33' }),
        event('screen_left', 's1', 5_000, {
          route: '/accounts/3f1c2a90-7b41-4d0e-9f22-6c8b5e4a1d33',
          durationMs: 5_000,
          leaveMode: 'nav',
        }),
      ]),
    )
    expect(views).toHaveLength(1)
    expect(views[0]?.route).toBe('/accounts/$id')
    expect(JSON.stringify(views)).not.toContain('3f1c2a90')
  })

  it('relie une vue à la SUIVANTE — c’est ce qui donne une destination de sortie', () => {
    const views = reconstructViews(
      rows([...visit('s1', '/accounts', 0, 4_000), ...visit('s1', '/contacts', 5_000, 4_000)]),
    )
    expect(views[0]?.nextRoute).toBe('/contacts')
    expect(views[1]?.nextRoute).toBeNull()
  })

  it('un `screen_left` d’un AUTRE écran ne ferme pas la vue courante', () => {
    const views = reconstructViews(
      rows([
        event('screen_viewed', 's1', 0, { route: '/accounts' }),
        event('screen_left', 's1', 1_000, { route: '/contacts', durationMs: 1_000, leaveMode: 'nav' }),
      ]),
    )
    expect(views[0]?.duration).toBeNull()
    expect(views[0]?.leaveMode).toBeNull()
  })

  it('un chemin qu’aucun motif ne reconnaît n’ouvre AUCUNE vue', () => {
    const views = reconstructViews(rows([event('screen_viewed', 's1', 0, { route: '/ceci-nexiste-pas' })]))
    expect(views).toHaveLength(0)
  })

  // #2108.48.63/#2208.85 — le délai OUVERTURE → PREMIÈRE ACTION se dérive des
  // deux instants déjà journalisés (`screen_viewed`, `action_started`) : aucun
  // nouvel événement à émettre, seulement le repli qui manquait.
  it('#2108.63 — capture l’instant de la PREMIÈRE action, jamais la suivante', () => {
    const views = reconstructViews(
      rows([
        event('screen_viewed', 's1', 0, { route: '/accounts' }),
        event('action_started', 's1', 300, { action: 'exporter', screen: '/accounts' }),
        event('action_started', 's1', 900, { action: 'exporter', screen: '/accounts' }),
        event('screen_left', 's1', 2_000, { route: '/accounts', durationMs: 2_000, leaveMode: 'nav' }),
      ]),
    )
    expect(views[0]?.firstActionAt).toBe(BASE + 300)
  })

  it('#2108.63 — sans action, `firstActionAt` reste `null` — jamais un délai de zéro', () => {
    const views = reconstructViews(
      rows([
        event('screen_viewed', 's1', 0, { route: '/accounts' }),
        event('screen_left', 's1', 2_000, { route: '/accounts', durationMs: 2_000, leaveMode: 'nav' }),
      ]),
    )
    expect(views[0]?.firstActionAt).toBeNull()
  })

  it('#2108.63 — une action d’une AUTRE vue ne compte pas pour celle-ci', () => {
    const views = reconstructViews(
      rows([
        ...visit('s1', '/accounts', 0, 4_000, 1),
        event('screen_viewed', 's1', 5_000, { route: '/contacts' }),
        event('screen_left', 's1', 9_000, { route: '/contacts', durationMs: 4_000, leaveMode: 'nav' }),
      ]),
    )
    expect(views[1]?.route).toBe('/contacts')
    expect(views[1]?.firstActionAt).toBeNull()
  })
})

describe('groupBySession', () => {
  it('range chaque session dans l’ORDRE de ses instants, quel que soit l’ordre d’arrivée', () => {
    const sessions = groupBySession([
      event('screen_left', 's1', 9_000, {}),
      event('screen_viewed', 's1', 1_000, {}),
      event('screen_viewed', 's2', 2_000, {}),
    ])
    expect([...sessions.keys()].sort()).toEqual(['s1', 's2'])
    expect(sessions.get('s1')?.map(row => row.eventName)).toEqual(['screen_viewed', 'screen_left'])
  })
})

describe('ProductAnalyticsReadService.screens — #1683', () => {
  it('agrège par ÉCRAN, publie au-dessus du seuil, et n’invente aucun espace', async () => {
    const { service } = makeService(fiveSessionsOn('/accounts', 60_000, 1))
    const report = await service.screens(7)

    const accounts = report.screens.find(screen => screen.route === '/accounts')
    expect(accounts?.label.fr).toBe('Comptes')
    expect(accounts?.label.en).toBe('Accounts')
    expect(accounts?.sessions).toBe(MIN_DISTINCT_SESSIONS_FOR_A_METRIC)
    expect(accounts?.measures.kind).toBe('measured')
    if (accounts?.measures.kind === 'measured') {
      expect(accounts.measures.medianDuration).toEqual({ kind: 'measured', seconds: 60 })
      // Cinq vues, chacune avec une action → taux d'action à 1.
      expect(accounts.measures.actionRate).toEqual({ kind: 'measured', ratio: 1, over: 5 })
      // Une minute par vue : aucun rebond.
      expect(accounts.measures.bounceRate).toEqual({ kind: 'measured', ratio: 0, over: 5 })
      // #2108.63/#2208.85 — chaque vue lance son action 100 ms après l'ouverture
      // (`visit()`) : la médiane vaut ce délai, dérivé de deux instants déjà
      // journalisés, sans aucun nouvel événement à émettre.
      expect(accounts.measures.medianTimeToFirstAction).toEqual({ kind: 'measured', seconds: 0.1 })
    }

    // Règle 4/5 : le flux ne porte AUCUN espace. On le DIT.
    expect(report.distinctWorkspaces).toEqual({
      kind: 'not_derivable',
      reason: 'behavioral_flow_carries_no_workspace',
    })
  })

  it('#2108.63 — sans AUCUNE action, le délai jusqu’à la première reste « non mesuré », jamais 0', async () => {
    const { service } = makeService(fiveSessionsOn('/accounts', 60_000, 0))
    const report = await service.screens(7)
    const accounts = report.screens.find(screen => screen.route === '/accounts')
    if (accounts?.measures.kind !== 'measured') throw new Error('mesures attendues')
    expect(accounts.measures.medianTimeToFirstAction).toEqual({ kind: 'unmeasured' })
  })

  it('sous le seuil, la ligne EXISTE et ses mesures sont RETENUES — jamais des zéros', async () => {
    const { service } = makeService([...visit('s1', '/accounts', 0, 2_000), ...visit('s2', '/accounts', 10_000, 2_000)])
    const report = await service.screens(7)

    const accounts = report.screens.find(screen => screen.route === '/accounts')
    // L'écran est là — sinon « trop récent » serait indiscernable de « jamais ouvert ».
    expect(accounts?.views).toBe(2)
    expect(accounts?.sessions).toBe(2)
    expect(accounts?.measures).toEqual({ kind: 'below_threshold', minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC })
    // Le témoin : aucun taux à 0 ne s'est glissé dans la réponse.
    expect(JSON.stringify(accounts?.measures)).not.toContain('"ratio"')
  })

  it('sait dire NON — une vue COURTE et sans action est un rebond', async () => {
    const { service } = makeService(fiveSessionsOn('/accounts', 3_000, 0))
    const report = await service.screens(7)
    const accounts = report.screens.find(screen => screen.route === '/accounts')
    if (accounts?.measures.kind !== 'measured') throw new Error('mesures attendues publiées')
    expect(accounts.measures.bounceRate).toEqual({ kind: 'measured', ratio: 1, over: 5 })
    expect(accounts.measures.actionRate).toEqual({ kind: 'measured', ratio: 0, over: 5 })
  })

  it('une vue JAMAIS fermée sort du dénominateur du rebond — elle n’est ni l’un ni l’autre', async () => {
    const rows = fiveSessionsOn('/accounts', 3_000, 0)
    // Une sixième session ouvre l'écran et ne le referme jamais.
    rows.push(event('screen_viewed', 's5', 400_000, { route: '/accounts' }))
    const { service } = makeService(rows)
    const report = await service.screens(7)
    const accounts = report.screens.find(screen => screen.route === '/accounts')
    if (accounts?.measures.kind !== 'measured') throw new Error('mesures attendues publiées')
    expect(accounts.views).toBe(6)
    // Cinq vues fermées seulement : le dénominateur du rebond reste 5.
    expect(accounts.measures.bounceRate).toEqual({ kind: 'measured', ratio: 1, over: 5 })
  })

  it('une durée bornée à 30 min ne devient JAMAIS un nombre', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(event('screen_viewed', `s${index}`, index * 1_000, { route: '/accounts' }))
      rows.push(
        event('screen_left', `s${index}`, index * 1_000 + 500, {
          route: '/accounts',
          durationMs: 'over_30_min',
          leaveMode: 'fermeture',
        }),
      )
    }
    const { service } = makeService(rows)
    const report = await service.screens(7)
    const accounts = report.screens.find(screen => screen.route === '/accounts')
    if (accounts?.measures.kind !== 'measured') throw new Error('mesures attendues publiées')
    expect(accounts.measures.medianDuration).toEqual({ kind: 'over_30_min' })
  })

  it('compte à part les chemins qu’aucun motif ne reconnaît', async () => {
    const { service } = makeService([event('screen_viewed', 's1', 0, { route: '/une-route-inconnue' })])
    const report = await service.screens(7)
    expect(report.unresolvedPaths).toBe(1)
    expect(report.screens).toHaveLength(0)
  })

  it('dit ce qu’il a couvert, et borne la fenêtre demandée', async () => {
    const { service, repo } = makeService(fiveSessionsOn('/accounts', 5_000))
    const report = await service.screens(Number.NaN)
    expect(report.coverage.windowDays).toBe(7)
    expect(report.coverage.complete).toBe(true)
    expect(report.coverage.oldestEventAt).not.toBeNull()

    const behavioral = repo.manager.query.mock.calls.find(([sql]) => (sql as string).includes('q:behavioral'))
    expect(behavioral?.[1]).toEqual([expect.arrayContaining(['screen_viewed', 'error_shown']), 7])
  })
})

describe('ProductAnalyticsReadService.accountSections — #2130.71', () => {
  const ACCOUNT_SCREEN = '/accounts/$id'

  function tabOpened(sessionId: string, at: number, tab: string, screen = ACCOUNT_SCREEN): Seeded {
    return event('tab_opened', sessionId, at, { screen, tab })
  }

  it('agrège par SECTION, la plus ouverte d’abord, au-dessus du seuil', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(tabOpened(`s${index}`, index * 1_000, 'contacts'))
    }
    // Une seule session ouvre aussi 'partners' — la ligne existe quand même
    // (compte brut, comme `views`), même si son propre effectif est faible :
    // c'est le TOTAL des sessions ayant ouvert une section qui décide de la
    // publication du tableau, pas chaque section prise isolément — même
    // patron que `sequences` (#1684.2), pas celui d'`exits` par écran.
    rows.push(tabOpened('s0', 2_000, 'partners'))

    const { service } = makeService(rows)
    const report = await service.accountSections(7)
    if (report.sections.kind !== 'measured') throw new Error('sections attendues publiées')
    expect(report.sections.value).toEqual([
      { tab: 'contacts', opens: MIN_DISTINCT_SESSIONS_FOR_A_METRIC, sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
      { tab: 'partners', opens: 1, sessions: 1 },
    ])
  })

  it('ignore le `tab_opened` d’une AUTRE fiche à onglets — jamais mélangé au classement du dossier compte', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(tabOpened(`s${index}`, index * 1_000, 'contacts'))
      // Même nature d'événement, même clé d'onglet, un AUTRE écran.
      rows.push(tabOpened(`t${index}`, index * 1_000, 'contacts', '/consultants/$id'))
    }
    const { service } = makeService(rows)
    const report = await service.accountSections(7)
    if (report.sections.kind !== 'measured') throw new Error('sections attendues publiées')
    expect(report.sections.value).toEqual([
      { tab: 'contacts', opens: MIN_DISTINCT_SESSIONS_FOR_A_METRIC, sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
    ])
  })

  it('sous le seuil, aucune ligne ne sort — jamais un classement partiel', async () => {
    const rows = [tabOpened('s1', 0, 'contacts'), tabOpened('s2', 1_000, 'partners')]
    const { service } = makeService(rows)
    const report = await service.accountSections(7)
    expect(report.sections).toEqual({
      kind: 'below_threshold',
      sessions: 2,
      minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    })
    expect(JSON.stringify(report.sections)).not.toContain('contacts')
  })

  it('« pas instrumenté » n’est pas « zéro » — `tab_opened` jamais écrit le DIT', async () => {
    const { service } = makeService(fiveSessionsOn('/accounts', 5_000), ['screen_viewed', 'screen_left'])
    const report = await service.accountSections(7)
    expect(report.sections).toEqual({ kind: 'not_instrumented' })
  })
})

describe('ProductAnalyticsReadService.accountSections — comprehension (#2130.69, « ouverture → compréhension »)', () => {
  const ACCOUNT_SCREEN = '/accounts/$id'

  function openThenExplore(sessionId: string, at: number, delayToFirstTabMs: number): Seeded[] {
    return [
      event('screen_viewed', sessionId, at, { route: ACCOUNT_SCREEN }),
      event('tab_opened', sessionId, at + delayToFirstTabMs, { screen: ACCOUNT_SCREEN, tab: 'contacts' }),
      // Une deuxième section ouverte plus tard ne doit PAS déplacer le délai —
      // seule la PREMIÈRE section ouverte compte, jamais la dernière.
      event('tab_opened', sessionId, at + delayToFirstTabMs + 9_000, { screen: ACCOUNT_SCREEN, tab: 'partners' }),
    ]
  }

  it('mesure le délai jusqu’à la PREMIÈRE section ouverte, au-dessus du seuil', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(...openThenExplore(`s${index}`, index * 60_000, 3_000))
    }
    const { service } = makeService(rows)
    const report = await service.accountSections(7)
    expect(report.comprehension).toEqual({
      kind: 'measured',
      sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      value: { medianTimeToComprehension: { kind: 'measured', seconds: 3 } },
    })
  })

  it('sous le seuil, jamais un délai publié', async () => {
    const rows = [...openThenExplore('s1', 0, 3_000), ...openThenExplore('s2', 60_000, 3_000)]
    const { service } = makeService(rows)
    const report = await service.accountSections(7)
    expect(report.comprehension).toEqual({
      kind: 'below_threshold',
      sessions: 2,
      minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    })
  })

  it('« pas instrumenté » n’est pas « zéro » — `tab_opened` jamais écrit le DIT', async () => {
    const { service } = makeService(fiveSessionsOn(ACCOUNT_SCREEN, 5_000), ['screen_viewed', 'screen_left'])
    const report = await service.accountSections(7)
    expect(report.comprehension).toEqual({ kind: 'not_instrumented' })
  })

  it('une vue jamais suivie d’un `tab_opened` n’entre pas dans la mesure — jamais devinée', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(...visit(`v${index}`, ACCOUNT_SCREEN, index * 60_000, 4_000))
    }
    // `tab_opened` reste INSTRUMENTÉ (une autre fiche l'écrit) — sans quoi ce
    // test prouverait `not_instrumented`, pas « sous le seuil ».
    rows.push(event('tab_opened', 'unrelated', 0, { screen: '/talent/$id', tab: 'notes' }))
    const { service } = makeService(rows)
    const report = await service.accountSections(7)
    expect(report.comprehension).toEqual({
      kind: 'below_threshold',
      sessions: 0,
      minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    })
  })
})

describe('ProductAnalyticsReadService.accountSections — synthesisToAction (#2130.74, « Synthèse → action »)', () => {
  const ACCOUNT_SCREEN = '/accounts/$id'

  /** Une vue du dossier compte qui ouvre d'abord `tab`, puis démarre `actions`
   *  actions après un délai fixe — même patron que `visit()`, mais avec un
   *  `tab_opened` explicite entre l'ouverture et l'action. */
  function viewWithTab(sessionId: string, at: number, tab: string, actions = 0): Seeded[] {
    const rows: Seeded[] = [
      event('screen_viewed', sessionId, at, { route: ACCOUNT_SCREEN, previousViewDurationMs: null, provenance: null }),
      event('tab_opened', sessionId, at + 500, { screen: ACCOUNT_SCREEN, tab }),
    ]
    for (let index = 0; index < actions; index += 1) {
      rows.push(
        event('action_started', sessionId, at + 1_000 + index, {
          action: 'primary_action_clicked',
          screen: ACCOUNT_SCREEN,
        }),
      )
    }
    rows.push(
      event('screen_left', sessionId, at + 5_000, { route: ACCOUNT_SCREEN, durationMs: 5_000, leaveMode: 'nav' }),
    )
    return rows
  }

  it('mesure le taux de conversion parmi les vues entrées par la Synthèse, au-dessus du seuil', async () => {
    const rows: Seeded[] = []
    // Trois vues « Synthèse → action », deux « Synthèse, jamais d'action ».
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      const withAction = index < 3
      rows.push(...viewWithTab(`s${index}`, index * 60_000, 'overview', withAction ? 1 : 0))
    }
    const { service } = makeService(rows)
    const report = await service.accountSections(7)
    expect(report.synthesisToAction).toEqual({
      kind: 'measured',
      sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      value: { conversionRate: { kind: 'measured', ratio: 0.6, over: MIN_DISTINCT_SESSIONS_FOR_A_METRIC } },
    })
  })

  it('exclut du dénominateur les vues entrées par une AUTRE section — jamais mélangées à la Synthèse', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(...viewWithTab(`s${index}`, index * 60_000, 'overview', 1))
    }
    // Cinq vues de plus, entrées par Contacts — jamais comptées ici.
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(...viewWithTab(`c${index}`, 10_000_000 + index * 60_000, 'contacts', 0))
    }
    const { service } = makeService(rows)
    const report = await service.accountSections(7)
    expect(report.synthesisToAction).toEqual({
      kind: 'measured',
      sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      value: { conversionRate: { kind: 'measured', ratio: 1, over: MIN_DISTINCT_SESSIONS_FOR_A_METRIC } },
    })
  })

  it('sous le seuil, aucun taux publié', async () => {
    const rows = [...viewWithTab('s1', 0, 'overview', 1), ...viewWithTab('s2', 60_000, 'overview', 0)]
    const { service } = makeService(rows)
    const report = await service.accountSections(7)
    expect(report.synthesisToAction).toEqual({
      kind: 'below_threshold',
      sessions: 2,
      minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    })
  })

  it('« pas instrumenté » quand `action_started` n’a jamais été écrit — jamais un taux à zéro deviné', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(...viewWithTab(`s${index}`, index * 60_000, 'overview', 0))
    }
    const { service } = makeService(rows, ['screen_viewed', 'screen_left', 'tab_opened'])
    const report = await service.accountSections(7)
    expect(report.synthesisToAction).toEqual({ kind: 'not_instrumented' })
  })
})

describe('ProductAnalyticsReadService.accountSections — corrections (#2130.72, « nombre de corrections »)', () => {
  const ACCOUNT_SCREEN = '/accounts/$id'

  function correctionSubmitted(sessionId: string, at: number, screen = ACCOUNT_SCREEN): Seeded {
    return event('action_started', sessionId, at, { action: 'correction_submitted', screen })
  }

  it('compte les corrections soumises, au-dessus du seuil', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(correctionSubmitted(`s${index}`, index * 1_000))
    }
    // Une même session peut corriger deux fois — comptée deux fois au total,
    // une seule fois dans l'effectif de sessions qui décide la publication.
    rows.push(correctionSubmitted('s0', 500))
    const { service } = makeService(rows)
    const report = await service.accountSections(7)
    expect(report.corrections).toEqual({
      kind: 'measured',
      sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      value: { submitted: MIN_DISTINCT_SESSIONS_FOR_A_METRIC + 1 },
    })
  })

  it('ignore un `correction_submitted` d’un AUTRE écran — jamais mélangé au dossier compte', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(correctionSubmitted(`s${index}`, index * 1_000))
      rows.push(correctionSubmitted(`t${index}`, index * 1_000, '/consultants/$id'))
    }
    const { service } = makeService(rows)
    const report = await service.accountSections(7)
    expect(report.corrections).toEqual({
      kind: 'measured',
      sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      value: { submitted: MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
    })
  })

  it('ignore un `action_started` d’une AUTRE action — jamais confondu avec une correction', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(
        event('action_started', `s${index}`, index * 1_000, {
          action: 'primary_action_clicked',
          screen: ACCOUNT_SCREEN,
        }),
      )
    }
    const { service } = makeService(rows)
    const report = await service.accountSections(7)
    expect(report.corrections).toEqual({
      kind: 'below_threshold',
      sessions: 0,
      minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    })
  })

  it('sous le seuil, jamais un compte publié', async () => {
    const rows = [correctionSubmitted('s1', 0), correctionSubmitted('s2', 1_000)]
    const { service } = makeService(rows)
    const report = await service.accountSections(7)
    expect(report.corrections).toEqual({
      kind: 'below_threshold',
      sessions: 2,
      minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    })
    expect(JSON.stringify(report.corrections)).not.toContain('submitted')
  })

  it('« pas instrumenté » quand `action_started` n’a jamais été écrit — jamais un compte à zéro deviné', async () => {
    const { service } = makeService(fiveSessionsOn(ACCOUNT_SCREEN, 5_000), ['screen_viewed', 'screen_left'])
    const report = await service.accountSections(7)
    expect(report.corrections).toEqual({ kind: 'not_instrumented' })
  })
})

describe('ProductAnalyticsReadService.journeys — #1684', () => {
  it('rend la destination d’une sortie, et la part de fermeture PURE', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      const at = index * 60_000
      rows.push(...visit(`s${index}`, '/accounts', at, 4_000))
      rows.push(event('screen_viewed', `s${index}`, at + 5_000, { route: '/contacts' }))
      rows.push(
        event('screen_left', `s${index}`, at + 9_000, {
          route: '/contacts',
          durationMs: 4_000,
          leaveMode: 'fermeture',
        }),
      )
    }
    const { service } = makeService(rows)
    const report = await service.journeys(7)

    if (report.exits.kind !== 'measured') throw new Error('sorties attendues publiées')
    const accounts = report.exits.value.find(exit => exit.route === '/accounts')
    if (accounts?.detail.kind !== 'measured') throw new Error('détail attendu publié')
    expect(accounts.detail.destinations[0]).toMatchObject({ route: '/contacts', exits: 5 })
    expect(accounts.detail.closeRate).toEqual({ kind: 'measured', ratio: 0, over: 5 })

    const contacts = report.exits.value.find(exit => exit.route === '/contacts')
    if (contacts?.detail.kind !== 'measured') throw new Error('détail attendu publié')
    expect(contacts.detail.closeRate).toEqual({ kind: 'measured', ratio: 1, over: 5 })
    // Une fermeture n'a pas de destination : elle n'en invente pas une.
    expect(contacts.detail.destinations).toEqual([])
  })

  it('un parcours n’apparaît qu’à partir du seuil de sessions DISTINCTES', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      const at = index * 60_000
      rows.push(...visit(`s${index}`, '/accounts', at, 2_000))
      rows.push(...visit(`s${index}`, '/contacts', at + 3_000, 2_000))
      rows.push(...visit(`s${index}`, '/chat', at + 6_000, 2_000))
    }
    // Une session SEULE fait un parcours rare : il ne doit pas sortir.
    rows.push(...visit('rare', '/pilotage', 900_000, 1_000))
    rows.push(...visit('rare', '/pilotage/finance', 902_000, 1_000))
    rows.push(...visit('rare', '/pilotage/marche', 904_000, 1_000))

    const { service } = makeService(rows)
    const report = await service.journeys(7)
    if (report.sequences.kind !== 'measured') throw new Error('parcours attendus publiés')
    expect(report.sequences.value).toEqual([
      {
        routes: ['/accounts', '/contacts', '/chat'],
        labels: [
          { fr: 'Comptes', en: 'Accounts' },
          { fr: 'Contacts', en: 'Contacts' },
          { fr: 'Laura', en: 'Laura' },
        ],
        sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      },
    ])
  })

  it('un parcours interrompu = commencé, jamais terminé ni abandonné', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      const at = index * 60_000
      rows.push(event('screen_viewed', `s${index}`, at, { route: '/accounts' }))
      rows.push(event('action_started', `s${index}`, at + 1_000, { action: 'importer', screen: '/accounts' }))
      // Deux sessions terminent, trois restent en plan.
      if (index < 2)
        rows.push(event('action_completed', `s${index}`, at + 2_000, { action: 'importer', durationMs: 1_000 }))
    }
    const { service } = makeService(rows)
    const report = await service.journeys(7)
    if (report.interrupted.kind !== 'measured') throw new Error('parcours interrompus attendus publiés')
    expect(report.interrupted.value).toEqual([
      {
        action: 'importer',
        sessions: 3,
        startedSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        interruptionRate: { kind: 'measured', ratio: 0.6, over: MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
      },
    ])
  })

  it('un ABANDON déclaré n’est pas une interruption — le contraire ferait chercher un bug', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      const at = index * 60_000
      rows.push(event('action_started', `s${index}`, at, { action: 'importer', screen: '/accounts' }))
      rows.push(event('action_abandoned', `s${index}`, at + 1_000, { action: 'importer', atStep: 'mapping' }))
    }
    const { service } = makeService(rows)
    const report = await service.journeys(7)
    if (report.interrupted.kind !== 'measured') throw new Error('parcours interrompus attendus publiés')
    expect(report.interrupted.value).toEqual([])
  })

  it('« pas instrumenté » n’est pas « zéro » — aucune action jamais écrite le DIT', async () => {
    const { service } = makeService(fiveSessionsOn('/accounts', 5_000), ['screen_viewed', 'screen_left'])
    const report = await service.journeys(7)
    expect(report.interrupted).toEqual({ kind: 'not_instrumented' })
    expect(report.families.find(family => family.event === 'action_started')?.instrumented).toBe(false)
    expect(report.families.find(family => family.event === 'screen_viewed')?.instrumented).toBe(true)
  })
})

describe('onboardingQuestionAbandonment — #2085.16', () => {
  /** Une session qui ouvre `slug` puis le quitte par `leaveMode`. */
  function questionVisit(sessionId: string, at: number, slug: string, leaveMode: string): Seeded[] {
    const route = `/onboarding/acc1/decouverte/${slug}`
    return [
      event('screen_viewed', sessionId, at, { route }),
      event('screen_left', sessionId, at + 500, { route, durationMs: 500, leaveMode }),
    ]
  }

  it('non instrumenté : `screen_viewed` n’a jamais été écrit — ce n’est pas zéro', () => {
    const result = onboardingQuestionAbandonment(new Map(), [{ event: 'screen_viewed', instrumented: false }])
    expect(result).toEqual({ kind: 'not_instrumented' })
  })

  it('lit le SLUG réel, jamais le motif replié — une question sur cinq sessions, deux abandons', () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      // Les deux premières sessions s’arrêtent LÀ (fermeture) ; les trois
      // autres continuent (nav) — un abandon n’est jamais une navigation.
      rows.push(...questionVisit(`s${index}`, index * 60_000, 'nom-entreprise', index < 2 ? 'fermeture' : 'nav'))
    }
    const sessions = groupBySession(rows)
    const result = onboardingQuestionAbandonment(sessions, [{ event: 'screen_viewed', instrumented: true }])
    if (result.kind !== 'measured') throw new Error('measured attendu')
    expect(result.sessions).toBe(MIN_DISTINCT_SESSIONS_FOR_A_METRIC)
    expect(result.value).toEqual([
      {
        slug: 'nom-entreprise',
        sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        detail: {
          kind: 'measured',
          abandonedSessions: 2,
          abandonRate: { kind: 'measured', ratio: 0.4, over: 5 },
          // #2022.8 — la reprise se lit sur le MÊME corpus : deux sessions
          // ont abandonné, aucune n'est revenue.
          resumedSessions: 0,
          resumeRate: { kind: 'measured', ratio: 0, over: 2 },
        },
      },
    ])
  })

  it('sous le plancher, le détail par question ne sort plus du TOUT — l’enveloppe dit le seuil, pas zéro', () => {
    // ⚠️ Arbitrage du 16/09/2026, conséquence ASSUMÉE : ce test disait
    // l’inverse (« la question EXISTE, retenue ») et faisait rougir GA-267.
    // GA-267 gagne — règle 1 de `c64_analytique_produit`, relecture juridique
    // encore due, et la direction conservatrice n’expose jamais PLUS.
    // L’intention d’origine n’est pas perdue : elle remonte d’un cran, au test
    // suivant. Le raisonnement complet est au-dessus de la fonction gardée.
    const sessions = groupBySession(questionVisit('s1', 0, 'nom-entreprise', 'fermeture'))
    const result = onboardingQuestionAbandonment(sessions, [{ event: 'screen_viewed', instrumented: true }])
    expect(result).toEqual({
      kind: 'below_threshold',
      sessions: 1,
      minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    })
    // Aucun slug ne fuit dans l’enveloppe retenue.
    expect(JSON.stringify(result)).not.toContain('nom-entreprise')
  })

  it('AU-DESSUS du plancher, une question vue par une seule session EXISTE, retenue — jamais absente ni à zéro', () => {
    // Le symétrique du test précédent : le plancher se mesure sur le
    // QUESTIONNAIRE (cinq sessions distinctes l’ont ouvert), et une fois
    // franchi, la question rare reste dans la liste avec son détail retenu.
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(...questionVisit(`s${index}`, index * 60_000, 'nom-entreprise', 'nav'))
    }
    rows.push(...questionVisit('s0', 500_000, 'effectif', 'fermeture'))
    const sessions = groupBySession(rows)
    const result = onboardingQuestionAbandonment(sessions, [{ event: 'screen_viewed', instrumented: true }])
    if (result.kind !== 'measured') throw new Error('measured attendu')
    expect(result.value).toEqual([
      {
        slug: 'nom-entreprise',
        sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        detail: {
          kind: 'measured',
          abandonedSessions: 0,
          abandonRate: { kind: 'measured', ratio: 0, over: 5 },
          // #2022.8 — aucun abandon, donc aucun dénominateur : « non mesuré »,
          // jamais un taux de reprise de 0.
          resumedSessions: 0,
          resumeRate: { kind: 'unmeasured' },
        },
      },
      {
        slug: 'effectif',
        sessions: 1,
        detail: { kind: 'below_threshold', minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
      },
    ])
  })

  it('un écran hors onboarding, et une navigation en avant, n’entrent jamais dans le calcul', () => {
    const rows: Seeded[] = [...fiveSessionsOn('/accounts', 4_000)]
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(...questionVisit(`s${index}`, 100_000 + index * 60_000, 'nom-entreprise', 'nav'))
    }
    const sessions = groupBySession(rows)
    const result = onboardingQuestionAbandonment(sessions, [{ event: 'screen_viewed', instrumented: true }])
    if (result.kind !== 'measured') throw new Error('measured attendu')
    // `/accounts` n’a produit AUCUNE ligne (ce n’est pas une question
    // d’onboarding), et les vues de la question se sont toutes fermées par une
    // navigation, jamais un abandon.
    expect(result.value).toEqual([
      {
        slug: 'nom-entreprise',
        sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        detail: {
          kind: 'measured',
          abandonedSessions: 0,
          abandonRate: { kind: 'measured', ratio: 0, over: 5 },
          // #2022.8 — aucun abandon, donc aucun dénominateur : « non mesuré »,
          // jamais un taux de reprise de 0.
          resumedSessions: 0,
          resumeRate: { kind: 'unmeasured' },
        },
      },
    ])
  })

  it('câblée dans le rapport de parcours réel (`service.journeys`)', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(...questionVisit(`s${index}`, index * 60_000, 'nom-entreprise', 'fermeture'))
    }
    const { service } = makeService(rows)
    const report = await service.journeys(7)
    if (report.onboardingQuestionAbandonment.kind !== 'measured') throw new Error('measured attendu')
    expect(report.onboardingQuestionAbandonment.value[0]?.slug).toBe('nom-entreprise')
  })

  // ───────────────────────────────────────────────────────────────────────────
  // #2022.8 — LA REPRISE : de celles qui ont abandonné cette question, celles
  // qui y sont REVENUES. Même corpus, même plancher, aucun événement neuf.
  // ───────────────────────────────────────────────────────────────────────────
  it('#2022.8 — une session qui abandonne une question puis y REVIENT est une reprise', () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(...questionVisit(`s${index}`, index * 60_000, 'nom-entreprise', 'fermeture'))
    }
    // Deux des cinq rouvrent la MÊME question plus tard dans la même session.
    rows.push(...questionVisit('s0', 900_000, 'nom-entreprise', 'nav'))
    rows.push(...questionVisit('s1', 960_000, 'nom-entreprise', 'nav'))
    const sessions = groupBySession(rows)
    const result = onboardingQuestionAbandonment(sessions, [{ event: 'screen_viewed', instrumented: true }])
    if (result.kind !== 'measured') throw new Error('measured attendu')
    expect(result.value).toEqual([
      {
        slug: 'nom-entreprise',
        sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        detail: {
          kind: 'measured',
          abandonedSessions: 5,
          abandonRate: { kind: 'measured', ratio: 1, over: 5 },
          resumedSessions: 2,
          resumeRate: { kind: 'measured', ratio: 0.4, over: 5 },
        },
      },
    ])
  })

  it('#2022.8 — LE TÉMOIN : sans abandon il n’y a pas de dénominateur, donc pas de taux — jamais « 0 »', () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      // Que des navigations : personne n’a abandonné cette question.
      rows.push(...questionVisit(`s${index}`, index * 60_000, 'nom-entreprise', 'nav'))
    }
    // Et une seconde vue, qui n’est PAS une reprise : rien n’a été abandonné.
    rows.push(...questionVisit('s0', 900_000, 'nom-entreprise', 'nav'))
    const sessions = groupBySession(rows)
    const result = onboardingQuestionAbandonment(sessions, [{ event: 'screen_viewed', instrumented: true }])
    if (result.kind !== 'measured') throw new Error('measured attendu')
    expect(result.value[0]?.detail).toEqual({
      kind: 'measured',
      abandonedSessions: 0,
      abandonRate: { kind: 'measured', ratio: 0, over: 5 },
      resumedSessions: 0,
      // Le point entier : 0 abandon = aucun dénominateur, donc « non mesuré ».
      resumeRate: { kind: 'unmeasured' },
    })
  })

  it('#2022.8 — revenir sur une AUTRE question n’est pas une reprise de celle qu’on a quittée', () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(...questionVisit(`s${index}`, index * 60_000, 'nom-entreprise', 'fermeture'))
    }
    rows.push(...questionVisit('s0', 900_000, 'effectif', 'nav'))
    const sessions = groupBySession(rows)
    const result = onboardingQuestionAbandonment(sessions, [{ event: 'screen_viewed', instrumented: true }])
    if (result.kind !== 'measured') throw new Error('measured attendu')
    const line = result.value.find(row => row.slug === 'nom-entreprise')
    expect(line?.detail).toEqual({
      kind: 'measured',
      abandonedSessions: 5,
      abandonRate: { kind: 'measured', ratio: 1, over: 5 },
      resumedSessions: 0,
      resumeRate: { kind: 'measured', ratio: 0, over: 5 },
    })
  })
})

describe('ProductAnalyticsReadService.friction — #1687', () => {
  it('repère la même action trois fois en moins de 30 s', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      const at = index * 120_000
      rows.push(event('screen_viewed', `s${index}`, at, { route: '/accounts' }))
      rows.push(event('action_started', `s${index}`, at + 1_000, { action: 'enrichir', screen: '/accounts' }))
      rows.push(event('action_started', `s${index}`, at + 6_000, { action: 'enrichir', screen: '/accounts' }))
      rows.push(event('action_started', `s${index}`, at + 12_000, { action: 'enrichir', screen: '/accounts' }))
    }
    const { service } = makeService(rows)
    const report = await service.friction(7)
    if (report.repetitions.kind !== 'measured') throw new Error('répétitions attendues publiées')
    expect(report.repetitions.value).toEqual([{ action: 'enrichir', sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC }])
  })

  it('sait dire NON — trois fois en PLUS de 30 s n’est pas une répétition', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      const at = index * 300_000
      rows.push(event('screen_viewed', `s${index}`, at, { route: '/accounts' }))
      rows.push(event('action_started', `s${index}`, at + 1_000, { action: 'enrichir', screen: '/accounts' }))
      rows.push(event('action_started', `s${index}`, at + 20_000, { action: 'enrichir', screen: '/accounts' }))
      rows.push(event('action_started', `s${index}`, at + 60_000, { action: 'enrichir', screen: '/accounts' }))
    }
    const { service } = makeService(rows)
    const report = await service.friction(7)
    if (report.repetitions.kind !== 'measured') throw new Error('répétitions attendues publiées')
    expect(report.repetitions.value).toEqual([])
  })

  it('repère l’aller-retour A → B → A en moins de 20 s, et pas A → A → A', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      const at = index * 120_000
      rows.push(event('screen_viewed', `s${index}`, at, { route: '/accounts' }))
      rows.push(event('screen_viewed', `s${index}`, at + 5_000, { route: '/contacts' }))
      rows.push(event('screen_viewed', `s${index}`, at + 9_000, { route: '/accounts' }))
      // Un retour APRÈS 20 s ne compte pas.
      rows.push(event('screen_viewed', `s${index}`, at + 40_000, { route: '/chat' }))
      rows.push(event('screen_viewed', `s${index}`, at + 80_000, { route: '/accounts' }))
    }
    const { service } = makeService(rows)
    const report = await service.friction(7)
    if (report.roundTrips.kind !== 'measured') throw new Error('allers-retours attendus publiés')
    expect(report.roundTrips.value).toEqual([
      {
        from: '/accounts',
        to: '/contacts',
        fromLabel: { fr: 'Comptes', en: 'Accounts' },
        toLabel: { fr: 'Contacts', en: 'Contacts' },
        sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      },
    ])
  })

  it('compte les erreurs vues par ÉCRAN et par CODE', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(event('error_shown', `s${index}`, index * 1_000, { screen: '/accounts', errorCode: 'E_TIMEOUT' }))
    }
    const { service } = makeService(rows)
    const report = await service.friction(7)
    if (report.errors.kind !== 'measured') throw new Error('erreurs attendues publiées')
    expect(report.errors.value).toEqual([
      {
        route: '/accounts',
        label: { fr: 'Comptes', en: 'Accounts' },
        errorCode: 'E_TIMEOUT',
        occurrences: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      },
    ])
  })

  it('aucune erreur JAMAIS écrite se dit « pas instrumenté », pas « zéro erreur »', async () => {
    const { service } = makeService(fiveSessionsOn('/accounts', 5_000), ['screen_viewed', 'screen_left'])
    const report = await service.friction(7)
    expect(report.errors).toEqual({ kind: 'not_instrumented' })
    expect(report.repetitions).toEqual({ kind: 'not_instrumented' })
  })
})

describe('ProductAnalyticsReadService.demand — #1688', () => {
  it('compte les recherches SANS RÉSULTAT par écran, jamais le texte cherché', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(event('search_performed', `s${index}`, index * 1_000, { screen: '/accounts', resultCount: 0 }))
      rows.push(event('search_performed', `s${index}`, index * 1_000 + 500, { screen: '/accounts', resultCount: 12 }))
    }
    const { service } = makeService(rows)
    const report = await service.demand(7)
    if (report.emptySearches.kind !== 'measured') throw new Error('recherches vides attendues publiées')
    expect(report.emptySearches.value).toEqual([
      {
        route: '/accounts',
        label: { fr: 'Comptes', en: 'Accounts' },
        searches: 10,
        emptySearches: 5,
        sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        emptyRate: { kind: 'measured', ratio: 0.5, over: 10 },
      },
    ])
  })

  it('sous le seuil, rien n’est publié — et le compte de sessions dit pourquoi', async () => {
    const { service } = makeService([event('search_performed', 's1', 0, { screen: '/accounts', resultCount: 0 })])
    const report = await service.demand(7)
    expect(report.emptySearches).toEqual({
      kind: 'below_threshold',
      sessions: 1,
      minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    })
  })

  it('aucune recherche JAMAIS écrite se dit « pas instrumenté »', async () => {
    const { service } = makeService(fiveSessionsOn('/accounts', 5_000), ['screen_viewed'])
    const report = await service.demand(7)
    expect(report.emptySearches).toEqual({ kind: 'not_instrumented' })
  })
})

describe('la lecture ne fait jamais sortir un identifiant ni un espace', () => {
  it('aucun identifiant de compte, aucun `workspace_id`, dans AUCUN des quatre rapports', async () => {
    const uuid = '3f1c2a90-7b41-4d0e-9f22-6c8b5e4a1d33'
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(...visit(`s${index}`, `/accounts/${uuid}`, index * 60_000, 5_000, 1))
      rows.push(
        event('search_performed', `s${index}`, index * 60_000 + 6_000, { screen: `/accounts/${uuid}`, resultCount: 0 }),
      )
      rows.push(
        event('error_shown', `s${index}`, index * 60_000 + 7_000, { screen: `/accounts/${uuid}`, errorCode: 'E_X' }),
      )
    }
    const { service } = makeService(rows)
    const reports = await Promise.all([service.screens(7), service.journeys(7), service.friction(7), service.demand(7)])
    for (const report of reports) {
      const serialized = JSON.stringify(report)
      expect(serialized).not.toContain(uuid)
      // ⚠️ On cherche une CLÉ qui porterait un espace, pas le MOT « workspace » :
      // les rapports le prononcent volontairement pour dire que la colonne
      // « espaces » n'est pas dérivable de ce flux. Une garde qui bannirait le
      // mot interdirait la phrase qui explique l'absence.
      expect(serialized).not.toContain('"workspaceId"')
      expect(serialized).not.toContain('"workspaceName"')
      expect(serialized).not.toContain('"workspace_id"')
    }
    // …et le repliement a bien eu lieu, sinon le test ci-dessus serait vert sur
    // un rapport VIDE.
    const [screens] = reports
    expect(screens?.screens.map(screen => screen.route)).toContain('/accounts/$id')
  })

  it('la requête de balayage ne lit QUE les lignes de session — jamais le flux d’audit', async () => {
    const { service, repo } = makeService(fiveSessionsOn('/accounts', 5_000))
    await service.screens(7)
    const [sql] = repo.manager.query.mock.calls.find(([text]) => (text as string).includes('q:behavioral')) ?? []
    expect(sql).toContain('session_id IS NOT NULL')
    expect(sql).not.toContain('user_id')
    expect(sql).not.toContain('workspace_id')
  })
})

/**
 * #1946 — LA VALEUR, PAS LE VOLUME.
 *
 * Les quatre comparaisons que l'issue demande en toutes lettres — « réponse
 * utile ; réponse corrigée ; action réellement exécutée ; résultat métier » —
 * plus les repères d'amorce (#1946.1/.3) et les suites d'une proposition
 * (#1946.2/.4/.10/.11/.12).
 *
 * ⚠️ Le quatrième terme, le RÉSULTAT MÉTIER, n'est pas dérivable de ce flux et
 * le rapport le DIT au lieu d'afficher un zéro : `trackBehavioral()` écrit
 * `workspace_id` à `null` inconditionnellement (règle 5 de
 * `c64_analytique_produit`), donc aucun fait commercial ne peut être rattaché à
 * une session sans refabriquer l'attribution que la doctrine interdit.
 */
describe('#1946 — le rapport de valeur', () => {
  /** Une session qui produit TOUTE la chaîne : question, jugements, brouillon,
   *  action préparée jusqu'à l'exécution, et les quatre suites. */
  function valueSession(sessionId: string, at: number, usefulAfterMs: number | 'over_30_min'): Seeded[] {
    return [
      event('assistant_first_question_sent', sessionId, at, { screen: '/chat' }),
      event('assistant_answer_judged', sessionId, at + 1_000, { screen: '/chat', verdict: 'utile' }),
      event('assistant_first_useful_result', sessionId, at + 1_000, { screen: '/chat', durationMs: usefulAfterMs }),
      // #2130.73 — le SEUL vocabulaire réel : `ReplyFeedback.tsx` (le seul
      // appelant) écrit `pas_pertinent`, jamais `generique`.
      event('assistant_answer_judged', sessionId, at + 2_000, { screen: '/chat', verdict: 'pas_pertinent' }),
      event('draft_reused', sessionId, at + 3_000, { screen: '/chat', extent: 'reecrit' }),
      event('prepared_action_stage', sessionId, at + 4_000, { action: 'relance_compte', stage: 'preparee' }),
      event('prepared_action_stage', sessionId, at + 5_000, { action: 'relance_compte', stage: 'validee' }),
      event('prepared_action_stage', sessionId, at + 6_000, { action: 'relance_compte', stage: 'executee' }),
      event('suggestion_clicked', sessionId, at + 7_000, { screen: '/chat', rank: 1 }),
      event('assistant_redirect_followed', sessionId, at + 8_000, { fromScreen: '/chat', toScreen: '/accounts' }),
      event('intervention_outcome', sessionId, at + 9_000, {
        intervention: 'compte_sans_prochaine_action',
        outcome: 'ignoree',
      }),
      event('memory_added', sessionId, at + 10_000, { screen: '/chat' }),
    ]
  }

  function valueSeed(sessions: number, usefulAfterMs: number | 'over_30_min' = 4_000): Seeded[] {
    const rows: Seeded[] = []
    for (let index = 0; index < sessions; index += 1) {
      rows.push(...valueSession(`v${index}`, index * 600_000, usefulAfterMs))
    }
    return rows
  }

  it('#1946.1/.3 — l’amorce : première question, premier résultat utile, délai médian', async () => {
    const { service } = makeService(valueSeed(MIN_DISTINCT_SESSIONS_FOR_A_METRIC))
    const report = await service.valeur(30)

    expect(report.amorce).toEqual({
      kind: 'measured',
      sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      value: {
        firstQuestionSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        firstUsefulResultSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        usefulRate: { kind: 'measured', ratio: 1, over: MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
        medianTimeToUseful: { kind: 'measured', seconds: 4 },
      },
    })
  })

  it('#1946.3 — une médiane qui tombe sur la borne de 30 min ne fabrique pas un nombre', async () => {
    const { service } = makeService(valueSeed(MIN_DISTINCT_SESSIONS_FOR_A_METRIC, 'over_30_min'))
    const report = await service.valeur(30)
    expect(report.amorce).toMatchObject({ kind: 'measured', value: { medianTimeToUseful: { kind: 'over_30_min' } } })
  })

  it('#1946.9/.23 — réponse utile contre réponse générique, avec leur dénominateur', async () => {
    const { service } = makeService(valueSeed(MIN_DISTINCT_SESSIONS_FOR_A_METRIC))
    const report = await service.valeur(30)

    expect(report.reponses).toEqual({
      kind: 'measured',
      sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      value: {
        judged: 2 * MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        utileRate: { kind: 'measured', ratio: 0.5, over: 2 * MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
        generiqueRate: { kind: 'measured', ratio: 0.5, over: 2 * MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
        inexacteRate: { kind: 'measured', ratio: 0, over: 2 * MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
        // D10 — décision Louis 14/09/2026 : la mesure connaît les six verdicts.
        // Aucun des deux jugements de `valueSession` ne porte ces trois-là :
        // leur taux est 0, jamais absent — le dénominateur (`judged`) EST connu.
        dejaFaitRate: { kind: 'measured', ratio: 0, over: 2 * MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
        pasMaintenantRate: { kind: 'measured', ratio: 0, over: 2 * MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
        mauvaisePrioriteRate: { kind: 'measured', ratio: 0, over: 2 * MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
      },
    })
  })

  it('D10 — chaque verdict de retour tombe dans SA case, jamais une autre (six cas + trois témoins)', async () => {
    // Trois témoins : un verdict INCONNU (ni des six) compte dans le
    // dénominateur (`judged`) mais ne doit gonfler AUCUNE des six cases
    // nommées — sinon la mesure force une case, exactement ce que D10 refuse.
    //
    // #2130.73 — `generique`/`inexacte` sont les deux témoins qui comptent le
    // plus ici : ce sont les valeurs MORTES que le prédicat comparait avant
    // correction (`REPLY_FEEDBACK_VERDICTS` ne les contient pas, aucun
    // appelant ne les écrit). Les remettre dans le prédicat referait tomber ce
    // test — `generiqueRate`/`inexacteRate` gonfleraient au lieu de rester à
    // leur véritable case (`pas_pertinent`/`donnee_fausse`).
    const rows: Seeded[] = [
      ...['u0', 'u1'].map(id => event('assistant_answer_judged', id, 0, { screen: '/chat', verdict: 'utile' })),
      ...['g1', 'g2'].map(id => event('assistant_answer_judged', id, 0, { screen: '/chat', verdict: 'pas_pertinent' })),
      ...['i1', 'i2'].map(id => event('assistant_answer_judged', id, 0, { screen: '/chat', verdict: 'donnee_fausse' })),
      ...['d0', 'd1', 'd2'].map(id =>
        event('assistant_answer_judged', id, 0, { screen: '/chat', verdict: 'deja_fait' }),
      ),
      event('assistant_answer_judged', 'p0', 0, { screen: '/chat', verdict: 'pas_maintenant' }),
      event('assistant_answer_judged', 'm0', 0, { screen: '/chat', verdict: 'mauvaise_priorite' }),
      ...['w0', 'w1'].map(id =>
        event('assistant_answer_judged', id, 0, { screen: '/chat', verdict: 'signal_parasite' }),
      ),
      // Un seul de chaque valeur MORTE — délibérément MOINS que les deux
      // rangées réelles ci-dessus, pour qu'un prédicat qui recompare encore
      // `generique`/`inexacte` produise un ratio VISIBLEMENT différent
      // (0.07 au lieu de 0.13) plutôt qu'un faux positif par coïncidence.
      event('assistant_answer_judged', 'g0', 0, { screen: '/chat', verdict: 'generique' }),
      event('assistant_answer_judged', 'i0', 0, { screen: '/chat', verdict: 'inexacte' }),
    ]
    const { service } = makeService(rows)
    const report = await service.valeur(30)

    expect(report.reponses).toEqual({
      kind: 'measured',
      sessions: 15,
      value: {
        judged: 15,
        utileRate: { kind: 'measured', ratio: 0.13, over: 15 },
        generiqueRate: { kind: 'measured', ratio: 0.13, over: 15 },
        inexacteRate: { kind: 'measured', ratio: 0.13, over: 15 },
        dejaFaitRate: { kind: 'measured', ratio: 0.2, over: 15 },
        pasMaintenantRate: { kind: 'measured', ratio: 0.07, over: 15 },
        mauvaisePrioriteRate: { kind: 'measured', ratio: 0.07, over: 15 },
      },
    })
  })

  it('#1946.16/.24 — la part des brouillons RÉÉCRITS entièrement', async () => {
    const { service } = makeService(valueSeed(MIN_DISTINCT_SESSIONS_FOR_A_METRIC))
    const report = await service.valeur(30)
    expect(report.brouillons).toMatchObject({
      kind: 'measured',
      value: {
        reused: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        reecritRate: { kind: 'measured', ratio: 1, over: MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
        telQuelRate: { kind: 'measured', ratio: 0, over: MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
      },
    })
  })

  it('#2108.64/.65 — priorités : part traitée et part refusée, avec leur dénominateur (vues)', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      const id = `p${index}`
      const at = index * 600_000
      // Chaque session voit 4 priorités ; une acceptée, une refusée, une corrigée, une reportée.
      for (const [offset, name] of [
        [0, 'priority_viewed'],
        [1, 'priority_viewed'],
        [2, 'priority_viewed'],
        [3, 'priority_viewed'],
        [4, 'priority_accepted'],
        [5, 'priority_rejected'],
        [6, 'priority_corrected'],
        [7, 'priority_snoozed'],
      ] as const) {
        rows.push(event(name, id, at + offset * 1_000, { screen: '/briefing/', kind: 'task' }))
      }
    }
    const { service } = makeService(rows)
    const report = await service.valeur(30)
    const n = MIN_DISTINCT_SESSIONS_FOR_A_METRIC

    expect(report.priorites).toEqual({
      kind: 'measured',
      sessions: n,
      value: {
        viewed: 4 * n,
        accepted: n,
        snoozed: n,
        rejected: n,
        corrected: n,
        treatedRate: { kind: 'measured', ratio: 0.25, over: 4 * n },
        refusalRate: { kind: 'measured', ratio: 0.25, over: 4 * n },
      },
    })
  })

  it('#2108.64/.65 — priorités : jamais écrites → not_instrumented, jamais 0', async () => {
    const { service } = makeService(valueSeed(MIN_DISTINCT_SESSIONS_FOR_A_METRIC))
    expect((await service.valeur(30)).priorites).toEqual({ kind: 'not_instrumented' })
  })

  it('#1946.5-.8/.25 — la chaîne d’une action préparée, jusqu’à « réellement exécutée »', async () => {
    const { service } = makeService(valueSeed(MIN_DISTINCT_SESSIONS_FOR_A_METRIC))
    const report = await service.valeur(30)
    expect(report.actions).toMatchObject({ kind: 'measured' })
    const chains = (report.actions as { kind: 'measured'; value: unknown[] }).value
    expect(chains).toEqual([
      {
        action: 'relance_compte',
        prepared: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        validated: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        executed: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        corrected: 0,
        abandoned: 0,
        sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        executionRate: { kind: 'measured', ratio: 1, over: MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
        correctionRate: { kind: 'measured', ratio: 0, over: MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
      },
    ])
  })

  it('#1946.2/.4/.10/.11 — les suites d’une proposition, chacune avec son compte', async () => {
    const { service } = makeService(valueSeed(MIN_DISTINCT_SESSIONS_FOR_A_METRIC))
    const report = await service.valeur(30)
    expect(report.suites).toMatchObject({
      kind: 'measured',
      value: {
        suggestionClicks: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        redirectsFollowed: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        interventions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        interventionIgnoredRate: { kind: 'measured', ratio: 1, over: MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
        memoriesAdded: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      },
    })
  })

  it('#1946.26 — le résultat métier n’est pas dérivable de ce flux, et ce n’est pas « 0 »', async () => {
    const { service } = makeService(valueSeed(MIN_DISTINCT_SESSIONS_FOR_A_METRIC))
    const report = await service.valeur(30)
    expect(report.resultatMetier).toEqual({
      kind: 'not_derivable',
      reason: 'behavioral_flow_carries_no_workspace',
    })
  })

  it('sait dire NON — une session de moins et AUCUN bloc ne publie, sans jamais rendre 0', async () => {
    const { service } = makeService(valueSeed(MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1))
    const report = await service.valeur(30)

    for (const block of [report.amorce, report.reponses, report.brouillons, report.actions, report.suites]) {
      expect(block).toEqual({
        kind: 'below_threshold',
        sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1,
        minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      })
    }
  })

  it('n’attrape pas ce qu’il ne vise pas — une nature JAMAIS écrite sort « not_instrumented », pas « 0 »', async () => {
    // Le semis ne porte que l'amorce : les quatre autres blocs doivent se
    // distinguer d'un vrai zéro — « rien ne le mesure » n'est pas « personne ne
    // s'en sert ».
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(event('assistant_first_question_sent', `q${index}`, index * 60_000, { screen: '/chat' }))
    }
    const { service } = makeService(rows)
    const report = await service.valeur(30)

    expect(report.amorce).toMatchObject({ kind: 'measured' })
    expect(report.reponses).toEqual({ kind: 'not_instrumented' })
    expect(report.brouillons).toEqual({ kind: 'not_instrumented' })
    expect(report.priorites).toEqual({ kind: 'not_instrumented' })
    expect(report.actions).toEqual({ kind: 'not_instrumented' })
    expect(report.suites).toEqual({ kind: 'not_instrumented' })
    // …et l'amorce ne prétend pas avoir mesuré un premier résultat utile.
    expect(report.amorce).toMatchObject({
      value: { firstUsefulResultSessions: 0, medianTimeToUseful: { kind: 'unmeasured' } },
    })
  })

  it('LIT quelque chose — les 37 natures du flux sont déclarées, aucune n’est oubliée du balayage', async () => {
    const { service, repo } = makeService(valueSeed(MIN_DISTINCT_SESSIONS_FOR_A_METRIC))
    const report = await service.valeur(30)
    expect(report.families).toHaveLength(37)

    // Le point qui ferait « du code juste que personne n'appelle » : si la
    // liste du balayage était restée à neuf, aucune ligne #1946 ne serait
    // jamais lue — et le rapport serait vert en rendant des zéros.
    const behavioral = repo.manager.query.mock.calls.find(call => String(call[0]).includes('q:behavioral'))
    expect((behavioral?.[1] as unknown[])[0]).toContain('prepared_action_stage')
    // #2985 (#2767) — même piège que #1946 : la liste du Meeting OS doit
    // vraiment entrer dans le WHERE du balayage, pas seulement dans l'union.
    expect((behavioral?.[1] as unknown[])[0]).toContain('question_used')
  })
})

describe('ProductAnalyticsReadService.accountSections — contacts engagés (#2130.75)', () => {
  const ACCOUNT_SCREEN = '/accounts/$id'

  function opened(sessionId: string, at: number): Seeded {
    return event('tab_opened', sessionId, at, { screen: ACCOUNT_SCREEN, tab: 'contacts' })
  }
  function selected(sessionId: string, at: number, screen = ACCOUNT_SCREEN): Seeded {
    return event('action_started', sessionId, at, { action: 'contact_selected', screen })
  }

  it('part des sessions du dossier qui ont engagé un contact recommandé', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(opened(`s${index}`, index * 1_000))
    }
    rows.push(selected('s0', 5_000), selected('s0', 6_000))
    const { service } = makeService(rows)
    const report = await service.accountSections(7)
    expect(report.engagedContacts).toEqual({
      kind: 'measured',
      sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      value: { engagedRate: { kind: 'measured', ratio: 0.2, over: MIN_DISTINCT_SESSIONS_FOR_A_METRIC } },
    })
  })

  it('ignore un `contact_selected` d’un autre écran ou d’une session sans section ouverte', async () => {
    const rows: Seeded[] = []
    for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
      rows.push(opened(`s${index}`, index * 1_000))
    }
    rows.push(selected('s0', 5_000, '/consultants/$id'), selected('ghost', 5_000))
    const { service } = makeService(rows)
    const report = await service.accountSections(7)
    expect(report.engagedContacts).toMatchObject({
      kind: 'measured',
      value: { engagedRate: { kind: 'measured', ratio: 0, over: MIN_DISTINCT_SESSIONS_FOR_A_METRIC } },
    })
  })

  it('sous le seuil : jamais un taux publié', async () => {
    const { service } = makeService([opened('s1', 0), selected('s1', 1_000)])
    const report = await service.accountSections(7)
    expect(report.engagedContacts).toMatchObject({ kind: 'below_threshold' })
    expect(JSON.stringify(report.engagedContacts)).not.toContain('engagedRate')
  })

  it('« pas instrumenté » sans `action_started` — jamais un taux deviné', async () => {
    const { service } = makeService([opened('s1', 0)], ['tab_opened'])
    const report = await service.accountSections(7)
    expect(report.engagedContacts).toEqual({ kind: 'not_instrumented' })
  })
})
