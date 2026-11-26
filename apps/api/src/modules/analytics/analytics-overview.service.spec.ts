import { createMockRepository } from '../../database/test-utils'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import { MIN_DISTINCT_SESSIONS_FOR_A_METRIC } from '@bellum/contracts'
import {
  AnalyticsOverviewService,
  computeActivationCohort,
  computeActivationRate,
  computeConversionSnapshot,
  estimateMrrCents,
} from './analytics-overview.service'

/** Route each markered SQL query to its seeded result rows. */
function seededQuery(sql: string): unknown[] {
  if (sql.includes('q:events')) {
    return [
      { event_name: 'onboarding_started', count: 10 },
      { event_name: 'onboarding_completed', count: 6 },
      { event_name: 'analysis_started', count: 20 },
      { event_name: 'analysis_completed', count: 18 },
      { event_name: 'contact_enriched', count: 30 },
      { event_name: 'message_sent', count: 12 },
      { event_name: 'export_performed', count: 4 },
      { event_name: 'credits_topup', count: 2 },
    ]
  }
  if (sql.includes('q:activation')) return [{ activated: 4 }]
  if (sql.includes('q:analyses_ws')) return [{ workspaces: 3, started: 20 }]
  if (sql.includes('q:cost')) return [{ avg_cost: '0.65', total_cost: '13.0' }]
  if (sql.includes('q:ledger')) return [{ analysis_consumed: 20, enrichment_consumed: 30 }]
  if (sql.includes('q:subs')) {
    return [
      { plan: 'trial', count: 5, extra_seats: 0 },
      { plan: 'team', count: 2, extra_seats: 1 },
      { plan: 'growth', count: 1, extra_seats: 0 },
    ]
  }
  if (sql.includes('q:churn_sample')) return [{ user_id: 'u1', last_analysis: null }]
  if (sql.includes('q:churn_count')) return [{ n: 1 }]
  return []
}

function makeService() {
  const repo = createMockRepository<ProductEventEntity>()
  repo.manager.query.mockImplementation((sql: string) => Promise.resolve(seededQuery(sql)))
  const service = new AnalyticsOverviewService(repo as never)
  return { service, repo }
}

/**
 * #1681.1 — LE MÊME SERVICE, MAIS SOUS LE SEUIL.
 *
 * Le jeu de base sème `onboarding_completed: 6`, c'est-à-dire AU-DESSUS du
 * minimum de la doctrine : le retrait n'était donc jamais emprunté, et il n'y
 * avait pas une seule occurrence de `withheld` dans ce fichier. Un chemin que
 * rien n'exécute est un chemin qu'on croit tenu.
 *
 * Le nombre semé est dérivé de la constante partagée, jamais écrit en dur :
 * si le seuil produit bougeait, ce test suivrait au lieu de devenir faux.
 */
function makeServiceBelowThreshold(onboardingCompleted: number) {
  const repo = createMockRepository<ProductEventEntity>()
  repo.manager.query.mockImplementation((sql: string) => {
    if (sql.includes('q:events')) {
      return Promise.resolve([
        { event_name: 'onboarding_started', count: onboardingCompleted + 2 },
        { event_name: 'onboarding_completed', count: onboardingCompleted },
        { event_name: 'analysis_started', count: 20 },
      ])
    }
    return Promise.resolve(seededQuery(sql))
  })
  return new AnalyticsOverviewService(repo as never)
}

describe('AnalyticsOverviewService.getOverview', () => {
  it('aggregates seeded events + billing into the day-1 metrics', async () => {
    const { service } = makeService()
    const overview = await service.getOverview(30, 14)

    // Activation funnel: onboarding → first analysis.
    expect(overview.activation).toEqual({
      onboardingStarted: 10,
      onboardingCompleted: 6,
      activatedUsers: 4,
      activationRate: 0.67,
      // #2085.14 — non seedé ici (`q:cohort_activation` retombe sur le tableau
      // vide par défaut de `seededQuery`) : les trois horizons sont donc
      // `not_yet_mature`, jamais un zéro muet. Le comportement RÉEL (mesuré,
      // sous le seuil) est couvert par son propre describe ci-dessous.
      byCohort: [
        { horizonDays: 1, eligibleUsers: 0, activatedUsers: 0, state: 'not_yet_mature', rate: null },
        { horizonDays: 7, eligibleUsers: 0, activatedUsers: 0, state: 'not_yet_mature', rate: null },
        { horizonDays: 30, eligibleUsers: 0, activatedUsers: 0, state: 'not_yet_mature', rate: null },
      ],
    })

    // Analyses per workspace + cost from analysis_runs.
    expect(overview.analyses).toEqual({
      started: 20,
      completed: 18,
      workspacesWithAnalysis: 3,
      avgPerWorkspace: 6.67,
      avgCostEur: 0.65,
      totalCostEur: 13,
    })

    // Credits consumed (from credit_ledger) + top-ups (from events).
    expect(overview.credits).toEqual({ analysisConsumed: 20, enrichmentConsumed: 30, topups: 2 })

    // Engagement counters.
    expect(overview.engagement).toEqual({ contactsEnriched: 30, messagesSent: 12, exportsPerformed: 4 })

    // Revenu dérivé des abonnements × catalogue (team 259 × 2 + growth 249 + 1 siège Team à 59 €).
    expect(overview.revenue.planDistribution).toEqual({ trial: 5, team: 2, growth: 1 })
    expect(overview.revenue.paidAccounts).toBe(3)
    expect(overview.revenue.trialAccounts).toBe(5)
    // Grille du 27/08 : Growth passe de 249 € à 199 €, donc 826 → 776 €.
    expect(overview.revenue.estimatedMrrEur).toBe(776)
    // ARPA = 776 / 3 comptes payants.
    expect(overview.revenue.arpaEur).toBeCloseTo(258.67, 2)
    expect(overview.revenue.conversionSnapshotRate).toBe(0.38)

    // Churn-risk proxy.
    expect(overview.churnRisk.thresholdDays).toBe(14)
    expect(overview.churnRisk.atRiskUsers).toBe(1)
    expect(overview.churnRisk.sample).toEqual([{ userId: 'u1', lastAnalysisAt: null }])

    // Non-derivable metrics are documented, not fabricated.
    expect(overview.notes.length).toBeGreaterThan(0)
    expect(overview.windowDays).toBe(30)
  })

  it('clamps a garbage window to the default and still resolves', async () => {
    const { service } = makeService()
    const overview = await service.getOverview(Number.NaN, Number.NaN)
    expect(overview.windowDays).toBe(30)
    expect(overview.churnRisk.thresholdDays).toBe(14)
  })
})

describe('overview pure helpers', () => {
  it('computeActivationRate', () => {
    expect(computeActivationRate(4, 6)).toBe(0.67)
    expect(computeActivationRate(0, 0)).toBeNull()
  })

  it('computeConversionSnapshot', () => {
    expect(computeConversionSnapshot(3, 5)).toBe(0.38)
    expect(computeConversionSnapshot(0, 0)).toBeNull()
  })

  it('estimateMrrCents uses the plan grid + seat add-on, ignores unknown plans', () => {
    // Grille du 27/08 : Growth est passé de 249 € à 199 €.
    // 2×259 + 1×199 = 717 €, plus un siège supplémentaire Team à 59 € = 77 600 centimes.
    expect(estimateMrrCents({ team: 2, growth: 1, trial: 5 }, { team: 1 })).toBe(77600)
    expect(estimateMrrCents({ mystery: 9 }, {})).toBe(0)
  })

  it('estimateMrrCents prices extra seats with the PLAN they were bought on', () => {
    // Same seat count, different plans → different revenue once an operator
    // gives a tier its own add-on price.
    const seatGrid = { team: 2900, growth: 4900 }
    expect(estimateMrrCents({}, { team: 3 }, {}, seatGrid)).toBe(8700)
    expect(estimateMrrCents({}, { growth: 3 }, {}, seatGrid)).toBe(14700)
    // A seat on a plan absent from the grid contributes 0, never a guessed price.
    expect(estimateMrrCents({}, { mystery: 5 }, {}, seatGrid)).toBe(0)
  })
})

describe('AnalyticsOverviewService — le retrait sous le seuil (#1681.1)', () => {
  it('AU-DESSUS du seuil : le taux se publie, et rien n’est retenu', async () => {
    const overview = await makeServiceBelowThreshold(MIN_DISTINCT_SESSIONS_FOR_A_METRIC).getOverview(30, 14)

    expect(overview.activation.activationRate).not.toBeNull()
    expect(overview.withheld).toEqual([])
  })

  it('SOUS le seuil : le taux est `null` ET le retrait est NOMMÉ — jamais un zéro muet', async () => {
    const overview = await makeServiceBelowThreshold(MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1).getOverview(30, 14)

    // Les deux moitiés comptent. `activationRate: null` seul serait
    // indiscernable d'un dénominateur vide — c'est `withheld` qui dit LAQUELLE
    // des deux absences c'est, et avec quel effectif.
    expect(overview.activation.activationRate).toBeNull()
    expect(overview.withheld).toEqual([
      {
        kind: 'below_threshold',
        metric: 'activation.activationRate',
        subjects: MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1,
        minSubjects: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      },
    ])
  })

  it('le retrait ne s’étend PAS aux mesures qu’il ne vise pas', async () => {
    // Le témoin du cas légitime voisin : `avgPerWorkspace` a des ESPACES pour
    // dénominateur, `conversionSnapshotRate` des comptes clients. Une garde qui
    // les aurait emportés aurait fait taire le tableau entier pour protéger une
    // personne qu'aucun des deux ne désigne.
    const overview = await makeServiceBelowThreshold(MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1).getOverview(30, 14)

    expect(overview.analyses.avgPerWorkspace).not.toBeNull()
    expect(overview.revenue.conversionSnapshotRate).not.toBeNull()
    expect(overview.withheld.map(w => w.metric)).toEqual(['activation.activationRate'])
  })

  it('zéro onboardé est RETENU, pas publié comme « 0 % d’activation »', async () => {
    // Le pire cas : `computeActivationRate(0, 0)` rendrait une absence, et
    // l'écran l'écrirait « 0 % ». Le retrait passe avant, donc la question ne
    // se pose pas — et `subjects: 0` le dit.
    const overview = await makeServiceBelowThreshold(0).getOverview(30, 14)

    expect(overview.activation.activationRate).toBeNull()
    expect(overview.withheld[0]?.subjects).toBe(0)
  })
})

describe('computeActivationCohort — #2085.14, les TROIS états, jamais un zéro muet', () => {
  it('mesurée : au-dessus du seuil, un taux réel', () => {
    expect(computeActivationCohort(7, MIN_DISTINCT_SESSIONS_FOR_A_METRIC, 3)).toEqual({
      horizonDays: 7,
      eligibleUsers: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      activatedUsers: 3,
      state: 'measured',
      rate: round2(3 / MIN_DISTINCT_SESSIONS_FOR_A_METRIC),
    })
  })

  it('pas encore mûre : ZÉRO éligible n’est pas un zéro d’activation', () => {
    expect(computeActivationCohort(30, 0, 0)).toEqual({
      horizonDays: 30,
      eligibleUsers: 0,
      activatedUsers: 0,
      state: 'not_yet_mature',
      rate: null,
    })
  })

  it('sous le seuil : retenue, jamais un taux sur trois personnes', () => {
    expect(computeActivationCohort(1, MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1, 1)).toEqual({
      horizonDays: 1,
      eligibleUsers: MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1,
      activatedUsers: 1,
      state: 'below_threshold',
      rate: null,
    })
  })
})

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

describe('AnalyticsOverviewService.getOverview — byCohort, #2085.14', () => {
  /** Sème `q:cohort_activation` en routant sur le PREMIER paramètre
   *  (`horizonDays`) — la seule façon de distinguer J+1/J+7/J+30, qui
   *  partagent le même marqueur SQL. */
  function makeServiceWithCohorts(rows: Record<number, { eligible: number; activated: number }>) {
    const repo = createMockRepository<ProductEventEntity>()
    repo.manager.query.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('q:cohort_activation')) {
        const horizon = Number(params?.[0])
        const row = rows[horizon] ?? { eligible: 0, activated: 0 }
        return Promise.resolve([{ eligible: row.eligible, activated: row.activated }])
      }
      return Promise.resolve(seededQuery(sql))
    })
    return new AnalyticsOverviewService(repo as never)
  }

  it('trois horizons, trois états — une cohorte MÛRE ne rend pas les autres mûres', async () => {
    const overview = await makeServiceWithCohorts({
      1: { eligible: MIN_DISTINCT_SESSIONS_FOR_A_METRIC, activated: 2 },
      7: { eligible: MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1, activated: 1 },
      30: { eligible: 0, activated: 0 },
    }).getOverview(30, 14)

    expect(overview.activation.byCohort).toEqual([
      {
        horizonDays: 1,
        eligibleUsers: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        activatedUsers: 2,
        state: 'measured',
        rate: round2(2 / MIN_DISTINCT_SESSIONS_FOR_A_METRIC),
      },
      {
        horizonDays: 7,
        eligibleUsers: MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1,
        activatedUsers: 1,
        state: 'below_threshold',
        rate: null,
      },
      { horizonDays: 30, eligibleUsers: 0, activatedUsers: 0, state: 'not_yet_mature', rate: null },
    ])

    // Le J+7 sous le seuil est NOMMÉ dans `withheld` — le J+30 non mûr ne l'est
    // PAS : « pas encore mûr » et « trop peu de sujets » sont deux absences
    // différentes, et seule la seconde est la règle 1 de c64_analytique_produit.
    expect(overview.withheld).toEqual([
      {
        kind: 'below_threshold',
        metric: 'activation.byCohort.d7',
        subjects: MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1,
        minSubjects: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      },
    ])
  })
})
