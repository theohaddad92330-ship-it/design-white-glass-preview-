import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  OBSERVABILITY_ALERT_SETTINGS,
  breaches,
  measureAbnormalRefundCount,
  measureAuthorizationDeniedCount,
  measureChatResponseP95Ms,
  measureErrorRatePercent,
  measureHallucinationRatePercent,
  measureLatencyP95Ms,
  measureLeakDetectedCount,
  measureNoOutcomeRatePercent,
  observabilityAlertsDisabled,
  readPositiveNumber,
  type ChatTurnSample,
  type JudgeSample,
  type LeakEventSample,
  type RefundEventSample,
  type RunSample,
  type SecurityEventSample,
} from './observability-alerts'

/**
 * Ce que ces tests défendent : **une alerte qui n'a rien pu mesurer ne dit pas
 * « tout va bien »**.
 *
 * C'est le motif qui revient le plus souvent dans ce dépôt — « non mesuré » qui
 * s'écrit « 0 ». Sur une alerte, il a une conséquence particulière : un taux
 * d'erreur calculé sur zéro run vaut 0 %, passe sous n'importe quel seuil, et
 * l'alerte reste muette exactement le jour où plus rien ne tourne. Un service
 * mort et un service parfait rendraient le même silence.
 *
 * D'où la forme du résultat : `measured` porte une valeur, `unmeasured` porte
 * une RAISON et aucune valeur. Aucun appelant ne peut confondre les deux.
 */

const NOW = new Date('2026-08-29T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms)
const MINUTE = 60_000

const run = (partial: Partial<RunSample> = {}): RunSample => ({
  status: 'completed',
  createdAt: ago(10 * MINUTE),
  completedAt: ago(5 * MINUTE),
  workspaceId: 'ws1',
  ...partial,
})

/** `n` runs identiques — pour dépasser l'échantillon minimal sans bruit. */
const many = (n: number, partial: Partial<RunSample> = {}): RunSample[] => Array.from({ length: n }, () => run(partial))

const judge = (partial: Partial<JudgeSample> = {}): JudgeSample => ({
  accountId: 'acc',
  verdict: 'pass',
  ...partial,
})

// ── latence ───────────────────────────────────────────────────────────────────

describe('measureLatencyP95Ms', () => {
  const fast = () => run({ createdAt: ago(30 * MINUTE), completedAt: ago(29 * MINUTE) })
  const slow = () => run({ createdAt: ago(30 * MINUTE), completedAt: ago(20 * MINUTE) })

  it('mesure le p95 des runs qui ont VRAIMENT rendu un dossier', () => {
    // Rang le plus proche : sur 20 mesures, le p95 est la 19e. Une lenteur
    // isolée ne le déplace donc pas — c'est voulu, sinon l'alerte partirait sur
    // le premier run malchanceux de la journée.
    const oneOutlier = measureLatencyP95Ms([...Array.from({ length: 19 }, fast), slow()], 20)
    expect(oneOutlier.state === 'measured' && oneOutlier.value).toBe(MINUTE)

    // Deux, en revanche, ne se cachent plus.
    const twoOutliers = measureLatencyP95Ms([...Array.from({ length: 18 }, fast), slow(), slow()], 20)
    expect(twoOutliers.state).toBe('measured')
    expect(twoOutliers.state === 'measured' && twoOutliers.value).toBe(10 * MINUTE)
    expect(twoOutliers.sample).toBe(20)
  })

  it('sans aucun run terminé, la latence n’est pas « 0 ms » — elle est NON MESURÉE', () => {
    const measure = measureLatencyP95Ms([], 20)

    expect(measure.state).toBe('unmeasured')
    expect(measure.state === 'unmeasured' && measure.reason).toBe('no_observation')
    expect(measure).not.toHaveProperty('value')
  })

  it('sous l’échantillon minimal, le p95 n’est pas un p95', () => {
    // Sur cinq mesures, le « 95e centile » est le maximum : une seule lenteur
    // isolée déclencherait l'alerte tous les jours creux.
    const measure = measureLatencyP95Ms(many(5), 20)

    expect(measure.state).toBe('unmeasured')
    expect(measure.state === 'unmeasured' && measure.reason).toBe('sample_too_small')
    expect(measure.sample).toBe(5)
  })

  it('une durée absurde est ÉCARTÉE et COMPTÉE, jamais absorbée', () => {
    // `completed_at < created_at` est une donnée corrompue, pas une mesure. La
    // compter comme 0 ms tirerait le p95 vers le bas et rassurerait à tort.
    const runs = [...many(20), run({ createdAt: ago(MINUTE), completedAt: ago(5 * MINUTE) })]
    const measure = measureLatencyP95Ms(runs, 20)

    expect(measure.state).toBe('measured')
    expect(measure.sample).toBe(20)
    expect(measure.excluded).toBe(1)
  })

  it('un run encore en cours n’a pas de durée — il sort du calcul', () => {
    const runs = [...many(20), run({ status: 'analyzing', completedAt: null })]
    const measure = measureLatencyP95Ms(runs, 20)

    expect(measure.sample).toBe(20)
    expect(measure.excluded).toBe(1)
  })
})

// #2441.4 — le troisième seuil SLO du chat (`responseP95`, LAU-FINAL-155) : une
// statistique de POPULATION, pas la propriété d'un tour. Réutilise le MÊME
// calcul que `measureLatencyP95Ms` (rang le plus proche, `unmeasured` nommé) —
// un tour de chat réduit à son délai user→assistant est un cas particulier de
// `RunSample`.
describe('measureChatResponseP95Ms', () => {
  const turn = (partial: Partial<ChatTurnSample> = {}): ChatTurnSample => ({
    userAt: ago(30 * MINUTE),
    assistantAt: ago(29 * MINUTE),
    ...partial,
  })
  const manyTurns = (n: number, partial: Partial<ChatTurnSample> = {}): ChatTurnSample[] =>
    Array.from({ length: n }, () => turn(partial))

  it('mesure le p95 du délai user→assistant, comme measureLatencyP95Ms', () => {
    const fast = () => turn({ userAt: ago(30 * MINUTE), assistantAt: ago(29 * MINUTE) })
    const slow = () => turn({ userAt: ago(30 * MINUTE), assistantAt: ago(20 * MINUTE) })
    const measure = measureChatResponseP95Ms([...Array.from({ length: 19 }, fast), slow()], 20)

    expect(measure.state).toBe('measured')
    expect(measure.state === 'measured' && measure.value).toBe(MINUTE)
    expect(measure.sample).toBe(20)
  })

  it('sans aucun tour répondu, ce n’est pas « 0 ms » — c’est NON MESURÉ', () => {
    const measure = measureChatResponseP95Ms([], 20)

    expect(measure.state).toBe('unmeasured')
    expect(measure.state === 'unmeasured' && measure.reason).toBe('no_observation')
  })

  it('sous l’échantillon minimal, pas de p95', () => {
    const measure = measureChatResponseP95Ms(manyTurns(5), 20)

    expect(measure.state).toBe('unmeasured')
    expect(measure.state === 'unmeasured' && measure.reason).toBe('sample_too_small')
    expect(measure.sample).toBe(5)
  })

  it('un tour SANS réponse de Laura sort du calcul — jamais une durée devinée', () => {
    const turns = [...manyTurns(20), turn({ assistantAt: null })]
    const measure = measureChatResponseP95Ms(turns, 20)

    expect(measure.sample).toBe(20)
    expect(measure.excluded).toBe(1)
  })
})

// ── erreur ────────────────────────────────────────────────────────────────────

describe('measureErrorRatePercent', () => {
  it('rapporte les runs échoués aux runs TRANCHÉS', () => {
    const runs = [...many(18), ...many(2, { status: 'error', completedAt: ago(MINUTE) })]
    const measure = measureErrorRatePercent(runs, 20)

    expect(measure.state === 'measured' && measure.value).toBe(10)
    expect(measure.sample).toBe(20)
  })

  it('une annulation n’est pas une erreur — c’est une DÉCISION, elle sort du dénominateur', () => {
    const runs = [...many(20), ...many(10, { status: 'canceled' })]
    const measure = measureErrorRatePercent(runs, 20)

    expect(measure.state === 'measured' && measure.value).toBe(0)
    expect(measure.sample).toBe(20)
    expect(measure.excluded).toBe(10)
  })

  it('zéro run tranché ne vaut pas « zéro erreur »', () => {
    const measure = measureErrorRatePercent(many(5, { status: 'analyzing', completedAt: null }), 20)

    expect(measure.state).toBe('unmeasured')
    expect(measure.state === 'unmeasured' && measure.reason).toBe('no_observation')
  })
})

// ── no-outcome ────────────────────────────────────────────────────────────────

describe('measureNoOutcomeRatePercent', () => {
  it('compte les runs qui avaient le TEMPS de finir et n’ont rien rendu', () => {
    const stale = { status: 'analyzing', createdAt: ago(60 * MINUTE), completedAt: null }
    const runs = [...many(19), ...many(1, stale)]
    const measure = measureNoOutcomeRatePercent(runs, NOW, 20)

    expect(measure.state === 'measured' && measure.value).toBe(5)
    expect(measure.sample).toBe(20)
  })

  it('un run lancé il y a deux minutes travaille — il sort du dénominateur', () => {
    // Le compter comme « sans issue » ferait sonner l'alerte à chaque tour, et
    // le compter comme « abouti » diluerait ceux qui le sont vraiment.
    const fresh = { status: 'analyzing' as const, createdAt: ago(2 * MINUTE), completedAt: null }
    const measure = measureNoOutcomeRatePercent([...many(20), ...Array.from({ length: 5 }, () => run(fresh))], NOW, 20)

    expect(measure.sample).toBe(20)
    expect(measure.excluded).toBe(5)
  })

  it('sans run observable, le taux n’est pas « 0 % de runs sans issue »', () => {
    const measure = measureNoOutcomeRatePercent([], NOW, 20)

    expect(measure.state).toBe('unmeasured')
    expect(measure.state === 'unmeasured' && measure.reason).toBe('no_observation')
  })
})

// ── hallucination ─────────────────────────────────────────────────────────────

describe('measureHallucinationRatePercent', () => {
  it('compte les dossiers que le juge anti-hallucination a SIGNALÉS', () => {
    const judges = [...Array.from({ length: 19 }, () => judge()), judge({ verdict: 'flagged' })]
    const measure = measureHallucinationRatePercent(judges, 20)

    expect(measure.state === 'measured' && measure.value).toBe(5)
    expect(measure.sample).toBe(20)
  })

  it('un dossier SANS verdict n’est pas un dossier propre — il sort du dénominateur et se compte', () => {
    // Le juge est un node du graphe : un run interrompu avant lui n'écrit aucun
    // verdict. L'absorber en « pass » ferait baisser le taux exactement quand
    // les runs échouent — l'alerte s'éteindrait au pire moment.
    const judges = [
      ...Array.from({ length: 20 }, () => judge()),
      ...Array.from({ length: 8 }, () => judge({ verdict: null })),
    ]
    const measure = measureHallucinationRatePercent(judges, 20)

    expect(measure.state === 'measured' && measure.value).toBe(0)
    expect(measure.sample).toBe(20)
    expect(measure.excluded).toBe(8)
  })

  it('un verdict hors vocabulaire est écarté, jamais rangé de force', () => {
    const judges = [...Array.from({ length: 20 }, () => judge()), judge({ verdict: 'peut-être' })]
    const measure = measureHallucinationRatePercent(judges, 20)

    expect(measure.sample).toBe(20)
    expect(measure.excluded).toBe(1)
  })

  it('aucun dossier jugé ⇒ NON MESURÉ, jamais « 0 % d’hallucination »', () => {
    const measure = measureHallucinationRatePercent(
      Array.from({ length: 4 }, () => judge({ verdict: null })),
      20,
    )

    expect(measure.state).toBe('unmeasured')
    expect(measure.state === 'unmeasured' && measure.reason).toBe('no_observation')
    expect(measure.excluded).toBe(4)
  })
})

// ── épopée #2879 — le premier compteur de sécurité ────────────────────────────

describe('measureAuthorizationDeniedCount', () => {
  const event = (partial: Partial<SecurityEventSample> = {}): SecurityEventSample => ({
    createdAt: ago(MINUTE),
    ...partial,
  })

  it('compte les accès refusés de la fenêtre', () => {
    const measure = measureAuthorizationDeniedCount([event(), event(), event()])

    expect(measure.state === 'measured' && measure.value).toBe(3)
    expect(measure.sample).toBe(3)
    expect(measure.excluded).toBe(0)
  })

  it('AUCUN accès refusé est un ZÉRO VRAI — ce n’est pas un taux sans population', () => {
    // ⚠️ Contrairement aux mesures ci-dessus : ici l'API n'observe QUE les
    // refus, il n'existe aucun « nombre total de tentatives » dont ce serait
    // une part. Une liste vide veut donc dire « rien de mauvais n'est arrivé »,
    // jamais « on n'a rien pu regarder ».
    const measure = measureAuthorizationDeniedCount([])

    expect(measure.state).toBe('measured')
    expect(measure.state === 'measured' && measure.value).toBe(0)
  })

  it('une LECTURE impossible reste NON MESURÉE, jamais confondue avec un zéro vrai', () => {
    const measure = measureAuthorizationDeniedCount(null)

    expect(measure.state).toBe('unmeasured')
    expect(measure.state === 'unmeasured' && measure.reason).toBe('no_observation')
  })
})

describe('measureAbnormalRefundCount', () => {
  const refund = (partial: Partial<RefundEventSample> = {}): RefundEventSample => ({
    createdAt: ago(MINUTE),
    ...partial,
  })

  it('compte les remboursements nocturnes de la fenêtre', () => {
    const measure = measureAbnormalRefundCount([refund(), refund(), refund()])

    expect(measure.state === 'measured' && measure.value).toBe(3)
    expect(measure.sample).toBe(3)
    expect(measure.excluded).toBe(0)
  })

  it('AUCUN remboursement est un ZÉRO VRAI — ce n’est pas un taux sans population', () => {
    const measure = measureAbnormalRefundCount([])

    expect(measure.state).toBe('measured')
    expect(measure.state === 'measured' && measure.value).toBe(0)
  })

  it('une LECTURE impossible reste NON MESURÉE, jamais confondue avec un zéro vrai', () => {
    const measure = measureAbnormalRefundCount(null)

    expect(measure.state).toBe('unmeasured')
    expect(measure.state === 'unmeasured' && measure.reason).toBe('no_observation')
  })
})

describe('measureLeakDetectedCount', () => {
  const leak = (partial: Partial<LeakEventSample> = {}): LeakEventSample => ({
    createdAt: ago(MINUTE),
    ...partial,
  })

  it('compte les fuites détectées de la fenêtre', () => {
    const measure = measureLeakDetectedCount([leak(), leak()])

    expect(measure.state === 'measured' && measure.value).toBe(2)
    expect(measure.sample).toBe(2)
    expect(measure.excluded).toBe(0)
  })

  it('AUCUNE fuite est un ZÉRO VRAI — ce n’est pas un taux sans population', () => {
    const measure = measureLeakDetectedCount([])

    expect(measure.state).toBe('measured')
    expect(measure.state === 'measured' && measure.value).toBe(0)
  })

  it('une LECTURE impossible reste NON MESURÉE, jamais confondue avec un zéro vrai', () => {
    const measure = measureLeakDetectedCount(null)

    expect(measure.state).toBe('unmeasured')
    expect(measure.state === 'unmeasured' && measure.reason).toBe('no_observation')
  })
})

// ── le déclenchement ──────────────────────────────────────────────────────────

describe('breaches', () => {
  it('ne déclenche que sur une valeur MESURÉE strictement au-dessus du seuil', () => {
    expect(breaches({ state: 'measured', value: 11, sample: 20, excluded: 0 }, 10)).toBe(true)
    expect(breaches({ state: 'measured', value: 10, sample: 20, excluded: 0 }, 10)).toBe(false)
  })

  it('une mesure impossible ne déclenche RIEN — et surtout pas un « tout va bien »', () => {
    expect(breaches({ state: 'unmeasured', reason: 'no_observation', sample: 0, excluded: 0 }, 10)).toBe(false)
  })

  it('un seuil aberrant ne déclenche rien', () => {
    // Même règle que l'alerte de coût : une alerte qui part sur un réglage mal
    // saisi apprend à ignorer les alertes.
    const measured = { state: 'measured', value: 99, sample: 20, excluded: 0 } as const
    expect(breaches(measured, 0)).toBe(false)
    expect(breaches(measured, Number.NaN)).toBe(false)
    expect(breaches(measured, -1)).toBe(false)
  })
})

describe('readPositiveNumber', () => {
  it('lit une valeur valide, et retombe sur le défaut sinon', () => {
    expect(readPositiveNumber('42', 10)).toBe(42)
    expect(readPositiveNumber(' 7.5 ', 10)).toBe(7.5)
    expect(readPositiveNumber(undefined, 10)).toBe(10)
    expect(readPositiveNumber('', 10)).toBe(10)
    expect(readPositiveNumber('beaucoup', 10)).toBe(10)
    expect(readPositiveNumber('-3', 10)).toBe(10)
    expect(readPositiveNumber('0', 10)).toBe(10)
  })
})

describe('observabilityAlertsDisabled', () => {
  const previous = process.env['OBSERVABILITY_ALERTS_DISABLED']
  afterEach(() => {
    if (previous === undefined) delete process.env['OBSERVABILITY_ALERTS_DISABLED']
    else process.env['OBSERVABILITY_ALERTS_DISABLED'] = previous
  })

  it('les alertes sont ACTIVES par défaut ; le bris de glace est explicite', () => {
    delete process.env['OBSERVABILITY_ALERTS_DISABLED']
    expect(observabilityAlertsDisabled()).toBe(false)
    process.env['OBSERVABILITY_ALERTS_DISABLED'] = 'true'
    expect(observabilityAlertsDisabled()).toBe(true)
    process.env['OBSERVABILITY_ALERTS_DISABLED'] = 'yes'
    expect(observabilityAlertsDisabled()).toBe(false)
  })
})

// ── la garde : les CINQ alertes ont chacune un émetteur ────────────────────────

/**
 * GARDE — les cinq alertes d'observabilité (coût · latence · erreur ·
 * hallucination · no-outcome) ont chacune un ÉMETTEUR, et cet émetteur est
 * atteint par un planificateur.
 *
 * Pourquoi : le défaut n°1 de ce dépôt est du code juste que personne n'appelle.
 * Une alerte calculée dans un service qu'aucun `@Cron` n'atteint n'est pas une
 * alerte, c'est un indicateur de back-office. C'est exactement ce que le rapport
 * de la passe B a mesuré : la latence (`analysis-telemetry`) et le taux
 * d'hallucination (`quality-metrics`) étaient CALCULÉS depuis des semaines — et
 * il fallait ouvrir le back-office pour les voir.
 *
 * Elle LIT deux fichiers réels (assertion de corpus non vide ci-dessous) et sait
 * dire NON : retirer un `logger.error` ou le `@Cron` fait tomber ce bloc.
 */
describe('les sept alertes ont un émetteur', () => {
  /**
   * Le CODE, commentaires retirés.
   *
   * ⚠️ La première version de cette garde était BORGNE : elle cherchait
   * `logger.error` dans le fichier entier, et les deux services le NOMMENT dans
   * leur docstring (« la convention du dépôt est `logger.error` »). Remplacer
   * l'appel par un `warn` la laissait verte. Une garde qui lit la prose au lieu
   * du code garde une intention, pas un comportement.
   *
   * Limite connue : un `//` dans une chaîne de caractères serait mal découpé.
   * Aucun des deux fichiers n'en contient, et l'assertion de corpus ci-dessous
   * échouerait si le découpage vidait le fichier.
   */
  const codeOf = (relative: string) =>
    readFileSync(join(__dirname, relative), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')

  const costSource = codeOf('cost-alert.service.ts')
  const alertsSource = codeOf('observability-alerts.service.ts')

  it('lit un corpus NON VIDE — sinon la garde ne garde rien', () => {
    // Un chemin faux, ou un découpage trop gourmand, rendrait une chaîne quasi
    // vide et toutes les assertions ci-dessous passeraient en cherchant « rien »
    // dans « rien ». On vérifie aussi qu'il reste du CODE, pas que des accolades.
    expect(costSource.length).toBeGreaterThan(500)
    expect(alertsSource.length).toBeGreaterThan(500)
    expect(costSource).toContain('export class CostAlertService')
    expect(alertsSource).toContain('export class ObservabilityAlertsService')
  })

  it('le coût est émis par le passage du matin, sous verrou', () => {
    expect(costSource).toContain("@Cron('5 7 * * *'")
    expect(costSource).toContain('withSingletonLock(')
    expect(costSource).toContain('logger.error(')
  })

  it('la latence, l’erreur, l’hallucination, le no-outcome, les accès refusés et les remboursements sont ATTEINTS par ce même passage', () => {
    // Le point que cette garde tient vraiment : le service d'observabilité n'a
    // pas de `@Cron` à lui, donc rien ne l'appellerait si cette ligne
    // disparaissait — et les alertes justes redeviendraient du code mort.
    expect(costSource).toContain('this.observability?.runDailyCheck(')
    expect(alertsSource).toContain('async runDailyCheck(')
    // Chaque clé d'alerte doit apparaître dans le CODE qui émet — pas seulement
    // dans un commentaire d'intention.
    for (const key of [
      'latency',
      'error',
      'hallucination',
      'no_outcome',
      'authorization_denied',
      'abnormal_refund',
      'leak_detected',
      'cross_tenant_suspected',
      'injection_suspected',
      'permission_escalated',
      'mass_export',
    ]) {
      expect(alertsSource).toContain(`'${key}'`)
    }
    expect(alertsSource).toContain('logger.error(')
  })

  it('chaque alerte a UN seuil, et il vit à un seul endroit', () => {
    const keys = Object.values(OBSERVABILITY_ALERT_SETTINGS).map(setting => setting.env)
    expect(new Set(keys).size).toBe(keys.length)
    // Le service ne relit jamais `process.env` pour un seuil : il passe par le
    // registre. Deux lectures finiraient par diverger (GA-26).
    for (const key of keys) expect(alertsSource).not.toContain(key)
  })
})
