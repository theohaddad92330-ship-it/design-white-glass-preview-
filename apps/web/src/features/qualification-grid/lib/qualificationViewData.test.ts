import { describe, expect, it } from 'vitest'
import type { QualificationAxis, QualificationCriterion } from '@bellum/contracts'
import { axisValue, emptyCriterion, gridTotalState, scoreValue } from './qualificationViewData'

const axis = (over: Partial<QualificationAxis>): QualificationAxis => ({
  code: 'S1',
  label: 'Tier',
  kind: 'weighted',
  category: null,
  weight: 30,
  status: 'scored',
  points: 20,
  evidence: 'Tier 2',
  source: 'analysis',
  ...over,
})

describe('#3755 — valeurs affichées d’un axe (jamais « 0 » pour une absence)', () => {
  it('pondéré noté : points sur le poids', () => {
    expect(axisValue(axis({}))).toEqual({ kind: 'points', text: '20 / 30' })
  })

  it('pondéré évalué à zéro : un vrai zéro, sur preuve', () => {
    expect(axisValue(axis({ status: 'fail', points: 0 }))).toEqual({ kind: 'points', text: '0 / 30' })
  })

  it('non évaluable : nommé, sans chiffre', () => {
    expect(axisValue(axis({ status: 'not_evaluable', points: null, evidence: null }))).toEqual({
      kind: 'not_evaluable',
    })
  })

  it('éliminatoire : PASS / FAIL', () => {
    expect(axisValue(axis({ kind: 'eliminatory', weight: null, status: 'pass', points: null }))).toEqual({
      kind: 'pass',
    })
    expect(axisValue(axis({ kind: 'eliminatory', weight: null, status: 'fail', points: null }))).toEqual({
      kind: 'fail',
    })
  })
})

describe('#3755.6 — le score se lit sur le dénominateur ÉVALUABLE', () => {
  it('points / max évaluable', () => {
    expect(scoreValue({ points: 40, max: 50 })).toBe('40 / 50')
  })
  it('rien d’évaluable : null (l’écran dit « non évaluable », jamais 0 / 0)', () => {
    expect(scoreValue({ points: 0, max: 0 })).toBeNull()
  })
})

describe('#3755.2 — le total de la grille en édition', () => {
  const c = (weight: number | null, kind: 'weighted' | 'eliminatory' = 'weighted'): QualificationCriterion => ({
    ...emptyCriterion(0),
    kind,
    weight,
  })
  it('vaut 100 : prêt à enregistrer', () => {
    expect(gridTotalState([c(60), c(40), c(null, 'eliminatory')])).toEqual({ ok: true, total: 100 })
  })
  it('vaut 95 : refus nommé', () => {
    expect(gridTotalState([c(55), c(40)])).toEqual({ ok: false, total: 95, message: 'total 95/100' })
  })
})
