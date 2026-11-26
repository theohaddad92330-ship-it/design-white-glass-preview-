import { describe, expect, it } from 'vitest'
import {
  DEAL_PROBABILITY_METHOD,
  calibrateDealProbability,
  backtestDealProbability,
  calibratedProbabilitySchema,
  calibrationBacktestSchema,
  probableQuarterRevenue,
  quarterWindow,
} from './deal-probability.js'
import { OPEN_PIPELINE_STAGES } from './project.js'

/** Une issue réelle d'affaire close, telle que l'espace la connaît. */
const won = { outcome: 'won' as const, highestStage: 'negotiation' as const }
const lostAt = (stage: 'qualified' | 'confirmed' | 'profiles_submitted' | 'negotiation' | null) => ({
  outcome: 'lost' as const,
  highestStage: stage,
})

describe('#4016 L1 — une probabilité CALIBRÉE, jamais nue', () => {
  it('nomme sa méthode et rend un intervalle qui contient le chiffre', () => {
    const p = calibrateDealProbability({
      stage: 'negotiation',
      history: [won, won, won, lostAt('negotiation'), lostAt('negotiation'), won],
      shared: null,
    })
    expect(p.method).toBe(DEAL_PROBABILITY_METHOD)
    expect(p.value).not.toBeNull()
    // Beta(1 + 4, 1 + 2) : moyenne 5/8.
    expect(p.value).toBeCloseTo(5 / 8, 6)
    expect(p.interval?.level).toBe(0.8)
    expect(p.interval!.low).toBeLessThan(p.value!)
    expect(p.interval!.high).toBeGreaterThan(p.value!)
    expect(calibratedProbabilitySchema.safeParse(p).success).toBe(true)
  })

  it('les quantiles de l’intervalle sont justes (Beta(2,2) : 10 % = 0,1958)', () => {
    // Beta(1+1, 1+1) — un gagné, un perdu au stade, sans base commune.
    const p = calibrateDealProbability({
      stage: 'qualified',
      history: [won, lostAt('qualified')],
      shared: null,
      minObservations: 1,
    })
    expect(p.value).toBeCloseTo(0.5, 6)
    expect(p.interval!.low).toBeCloseTo(0.1958, 3)
    expect(p.interval!.high).toBeCloseTo(0.8042, 3)
  })

  it('chaque axe est NOMMÉ ; un axe non évaluable est nommé et sort du dénominateur', () => {
    const sansBase = calibrateDealProbability({
      stage: 'confirmed',
      history: [won, won, lostAt('negotiation'), lostAt('confirmed'), won],
      shared: null,
    })
    expect(sansBase.axes.map(a => a.key)).toEqual(['stage', 'workspace_history', 'shared_base'])
    expect(sansBase.unevaluable_axes).toEqual(['shared_base'])
    const base = sansBase.axes.find(a => a.key === 'shared_base')
    expect(base?.evaluable).toBe(false)
    expect(base?.reason).toBe('not_enough_shared_data')
    // Sorti du dénominateur : aucun pseudo-compte, donc Beta(1+3, 1+2).
    expect(base?.won).toBeNull()
    expect(base?.weight).toBeNull()
    expect(sansBase.value).toBeCloseTo(4 / 7, 6)
  })

  it('la base commune entre comme un a priori BORNÉ, jamais à la place de l’espace', () => {
    const p = calibrateDealProbability({
      stage: 'negotiation',
      history: [won, lostAt('negotiation')],
      // 40 cas ailleurs : ramenés à 10 pseudo-observations.
      shared: { won: 30, lost: 10, contributingWorkspaces: 5, dimension: 'size' },
    })
    const axis = p.axes.find(a => a.key === 'shared_base')
    expect(axis?.evaluable).toBe(true)
    expect(axis?.reason).toBe('size')
    expect(axis?.weight).toBeCloseTo(0.25, 6)
    // a = 1 + 1 + 7.5, b = 1 + 1 + 2.5
    expect(p.value).toBeCloseTo(9.5 / 14, 6)
    expect(p.observations).toBeCloseTo(12, 6)
  })

  it('une base commune sous le seuil de trois espaces n’entre pas', () => {
    const p = calibrateDealProbability({
      stage: 'negotiation',
      history: [won, won, won, won, lostAt('negotiation')],
      shared: { won: 30, lost: 10, contributingWorkspaces: 2, dimension: 'sector' },
    })
    expect(p.unevaluable_axes).toEqual(['shared_base'])
    expect(p.value).toBeCloseTo(5 / 7, 6)
  })

  it('un perdu dont on ignore le stade atteint ne compte qu’au premier stade du pipe', () => {
    const history = [won, won, won, lostAt(null), lostAt(null)]
    // #4338.1 — « Besoin exprimé » (`confirmed`) ouvre le pipe depuis le 19/10/2026 : c'est LUI le premier stade.
    const auPremier = calibrateDealProbability({ stage: OPEN_PIPELINE_STAGES[0], history, shared: null })
    const plusLoin = calibrateDealProbability({ stage: 'negotiation', history, shared: null, minObservations: 1 })
    expect(auPremier.axes.find(a => a.key === 'workspace_history')?.lost).toBe(2)
    expect(plusLoin.axes.find(a => a.key === 'workspace_history')?.lost).toBe(0)
  })

  it('« non mesuré » n’est pas 0 : trop peu d’issues réelles → `null`, raison nommée', () => {
    const p = calibrateDealProbability({ stage: 'negotiation', history: [won], shared: null })
    expect(p.value).toBeNull()
    expect(p.interval).toBeNull()
    expect(p.not_measured_reason).toBe('insufficient_history')
    expect(calibratedProbabilitySchema.safeParse(p).success).toBe(true)
  })

  it('un stade hors du pipe ouvert n’a pas de probabilité', () => {
    for (const stage of ['won', 'lost', 'detected'] as const) {
      const p = calibrateDealProbability({ stage, history: [won, won, won, won, won], shared: null })
      expect(p.value).toBeNull()
      expect(p.not_measured_reason).toBe('not_in_open_pipeline')
    }
  })
})

describe('#4016 L1 — le schéma sait dire NON à une probabilité nue', () => {
  const calibrated = calibrateDealProbability({
    stage: 'negotiation',
    history: [won, won, won, lostAt('negotiation'), won],
    shared: null,
  })

  it('accepte la forme calibrée', () => {
    expect(calibratedProbabilitySchema.safeParse(calibrated).success).toBe(true)
  })

  it('refuse un chiffre sans axes', () => {
    expect(calibratedProbabilitySchema.safeParse({ ...calibrated, axes: [] }).success).toBe(false)
  })

  it('refuse un chiffre sans intervalle', () => {
    expect(calibratedProbabilitySchema.safeParse({ ...calibrated, interval: null }).success).toBe(false)
  })

  it('refuse un chiffre sans méthode nommée', () => {
    expect(calibratedProbabilitySchema.safeParse({ ...calibrated, method: 'gut_feeling' }).success).toBe(false)
  })

  it('refuse un chiffre dont AUCUNE issue réelle ne porte le calcul', () => {
    const vide = {
      ...calibrated,
      axes: calibrated.axes.map(a => (a.key === 'stage' ? a : { ...a, evaluable: false })),
      unevaluable_axes: ['workspace_history', 'shared_base'],
    }
    expect(calibratedProbabilitySchema.safeParse(vide).success).toBe(false)
  })

  it('refuse un axe non évaluable qu’on aurait tu', () => {
    const sansBase = calibrateDealProbability({
      stage: 'negotiation',
      history: [won, won, won, lostAt('negotiation'), won],
      shared: null,
    })
    expect(calibratedProbabilitySchema.safeParse({ ...sansBase, unevaluable_axes: [] }).success).toBe(false)
  })

  it('refuse un nombre nu', () => {
    expect(calibratedProbabilitySchema.safeParse(0.72).success).toBe(false)
    expect(calibratedProbabilitySchema.safeParse({ value: 0.72 }).success).toBe(false)
  })
})

describe('#4016 L1 — le CA probable du trimestre', () => {
  const p = calibrateDealProbability({
    stage: 'negotiation',
    history: [won, won, won, lostAt('negotiation'), won],
    shared: null,
  })
  const nonMesure = calibrateDealProbability({ stage: 'negotiation', history: [], shared: null })

  it('somme montant × probabilité par devise, avec l’intervalle', () => {
    const out = probableQuarterRevenue([
      { amountCents: 100_000_00, currency: 'EUR', probability: p },
      { amountCents: 50_000_00, currency: 'EUR', probability: p },
      { amountCents: 10_000_00, currency: 'CHF', probability: p },
    ])
    expect(out.totals).toHaveLength(2)
    const eur = out.totals?.find(t => t.currency === 'EUR')
    expect(eur?.deals).toBe(2)
    expect(eur?.expected_cents).toBe(Math.round(150_000_00 * p.value!))
    expect(eur?.low_cents).toBe(Math.round(150_000_00 * p.interval!.low))
    expect(eur?.high_cents).toBe(Math.round(150_000_00 * p.interval!.high))
  })

  it('une affaire sans montant ou sans probabilité est COMPTÉE à part, jamais lue 0', () => {
    const out = probableQuarterRevenue([
      { amountCents: null, currency: 'EUR', probability: p },
      { amountCents: 20_000_00, currency: 'EUR', probability: nonMesure },
    ])
    expect(out.totals).toBeNull()
    expect(out.without_amount).toBe(1)
    expect(out.without_probability).toBe(1)
  })

  it('une ligne sans devise est lue en euros', () => {
    const out = probableQuarterRevenue([{ amountCents: 1000, currency: null, probability: p }])
    expect(out.totals?.[0]?.currency).toBe('EUR')
  })
})

describe('quarterWindow', () => {
  it('borne les trois mois à venir — un trimestre GLISSANT', () => {
    expect(quarterWindow(new Date('2026-10-11T10:00:00Z'))).toEqual({ from: '2026-10-11', until: '2027-01-11' })
    expect(quarterWindow(new Date('2026-12-30T23:00:00Z'))).toEqual({ from: '2026-12-30', until: '2027-03-30' })
  })
})

// #4016.1c — la mesure du calibrage a posteriori : un rétro-test « on laisse
// une affaire de côté », jamais une probabilité figée en base (GA-64).
describe('#4016.1c — mesure du calibrage (rétro-test, écart de Brier)', () => {
  const many = (n: number, outcome: 'won' | 'lost') =>
    Array.from({ length: n }, () => ({ outcome, highestStage: 'negotiation' as const }))

  it('rend l’écart de Brier, la référence sans modèle et la courbe de fiabilité', () => {
    const result = backtestDealProbability([...many(8, 'won'), ...many(4, 'lost')])
    expect(calibrationBacktestSchema.safeParse(result).success).toBe(true)
    expect(result.method).toBe('leave_one_out_v1')
    expect(result.evaluated).toBe(12)
    expect(result.brier).not.toBeNull()
    expect(result.brier as number).toBeGreaterThan(0)
    // Prédire toujours le taux de base est la référence à battre.
    expect(result.baseline_brier).toBeCloseTo((8 / 12) * (4 / 12), 5)
    const binned = result.bins.reduce((n, bin) => n + bin.count, 0)
    expect(binned).toBe(12)
  })

  it('« non mesuré » n’est pas 0 : trop peu d’affaires closes → null, raison nommée', () => {
    const result = backtestDealProbability(many(3, 'won'))
    expect(result.brier).toBeNull()
    expect(result.baseline_brier).toBeNull()
    expect(result.bins).toEqual([])
    expect(result.not_measured_reason).toBe('insufficient_history')
  })

  it('une affaire ne se prédit jamais elle-même (on la laisse de côté)', () => {
    // Sans signal (6 gagnées, 6 perdues), laisser l'affaire de côté fait pire que le taux de base ;
    // si elle comptait dans son propre historique, l'écart égalerait la référence (0,25).
    const result = backtestDealProbability([...many(6, 'won'), ...many(6, 'lost')])
    expect(result.brier as number).toBeGreaterThan(result.baseline_brier as number)
  })

  it('le schéma sait dire NON : un écart chiffré sans référence est refusé', () => {
    const result = backtestDealProbability([...many(8, 'won'), ...many(4, 'lost')])
    expect(calibrationBacktestSchema.safeParse({ ...result, baseline_brier: null }).success).toBe(false)
    expect(calibrationBacktestSchema.safeParse({ ...result, method: undefined }).success).toBe(false)
  })
})
