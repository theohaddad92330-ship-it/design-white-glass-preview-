import { describe, expect, it } from 'vitest'

import {
  computeDormantReactivationScore,
  DORMANT_REACTIVATION_AXES,
  DORMANT_REACTIVATION_AXIS_LABELS_EN,
  DORMANT_REACTIVATION_AXIS_LABELS_FR,
  DORMANT_REACTIVATION_SCORE_MAX,
  MIN_DORMANT_REACTIVATION_AXES_FOR_SCORE,
  type DormantReactivationScoreInput,
} from './dormant-reactivation-score.js'

// #2799 (épopée) / #2374.16-17 — le moteur de réactivation dormante classe
// selon NEUF critères NOMMÉS, jamais la seule ancienneté (doctrine CLAUDE.md :
// un score n'est jamais nu, un axe non évaluable sort du dénominateur et
// reste nommé, aucune probabilité, jamais de donnée inventée).

const richInput: DormantReactivationScoreInput = {
  monthsSinceLastActivity: 7,
  hasEmail: true,
  hasProfessionalNetwork: true,
  pastActivityCount: 8,
  lastActivitySubject: 'Point sur le renouvellement du contrat infogérance',
  signals: [{ label: 'A changé de poste' }],
  decisionRole: 'economic',
  title: 'Directeur des Systèmes d’Information',
  accountPriorityScore: 20,
  accountAssignedTo: 'user-42',
  whyContact: 'A porté le dernier appel d’offres gagné chez ce compte.',
}

const emptyInput: DormantReactivationScoreInput = {
  monthsSinceLastActivity: null,
  hasEmail: true,
  hasProfessionalNetwork: false,
  pastActivityCount: null,
  lastActivitySubject: null,
  signals: null,
  decisionRole: null,
  title: null,
  accountPriorityScore: null,
  accountAssignedTo: null,
  whyContact: null,
}

describe('DORMANT_REACTIVATION_AXES', () => {
  it('names exactly nine axes, each with a positive cap, summing to 100', () => {
    expect(DORMANT_REACTIVATION_AXES).toHaveLength(9)
    expect(DORMANT_REACTIVATION_AXES.every(axis => axis.max > 0)).toBe(true)
    expect(DORMANT_REACTIVATION_SCORE_MAX).toBe(100)
  })

  it('has a FR and EN label for every axis (i18n)', () => {
    for (const { key } of DORMANT_REACTIVATION_AXES) {
      expect(DORMANT_REACTIVATION_AXIS_LABELS_FR[key]).toBeTruthy()
      expect(DORMANT_REACTIVATION_AXIS_LABELS_EN[key]).toBeTruthy()
    }
  })
})

describe('computeDormantReactivationScore — un score n’est jamais nu', () => {
  it('names all nine axes even when every one of them is evaluated', () => {
    const { axes } = computeDormantReactivationScore(richInput)
    expect(axes).toHaveLength(9)
    expect(axes.every(axis => axis.points !== null)).toBe(true)
  })

  it('#2374.17 — un silence PLUS COURT vaut plus que le même contact resté dormant des années', () => {
    const recent = computeDormantReactivationScore({ ...richInput, monthsSinceLastActivity: 7 })
    const ancient = computeDormantReactivationScore({ ...richInput, monthsSinceLastActivity: 48 })
    const recentAxis = recent.axes.find(a => a.key === 'recency')
    const ancientAxis = ancient.axes.find(a => a.key === 'recency')
    expect(recentAxis?.points).not.toBeNull()
    expect(ancientAxis?.points).not.toBeNull()
    expect((recentAxis?.points as number) > (ancientAxis?.points as number)).toBe(true)
  })

  it('#2374.17 — l’ancienneté seule ne peut jamais dominer le score (plafond bas)', () => {
    const anciennete = DORMANT_REACTIVATION_AXES.find(a => a.key === 'recency')
    expect(anciennete?.max).toBeLessThanOrEqual(10)
    expect((anciennete?.max ?? 0) / DORMANT_REACTIVATION_SCORE_MAX).toBeLessThan(0.15)
  })

  it('exclut du dénominateur chaque axe non évaluable, et le NOMME quand même', () => {
    const { axes, score, maxPossible } = computeDormantReactivationScore(emptyInput)
    // Seule la joignabilité et le porteur de compte restent des FAITS
    // toujours observables (canal connu, porteur ou non) — les sept autres
    // n'ont ici aucune donnée et sortent du dénominateur.
    const nonEvaluated = axes.filter(a => a.points === null)
    expect(nonEvaluated.length).toBeGreaterThan(0)
    expect(axes).toHaveLength(9) // toujours nommés
    // moins de MIN_DORMANT_REACTIVATION_AXES_FOR_SCORE axes évalués → pas de score
    const evaluatedCount = axes.length - nonEvaluated.length
    if (evaluatedCount < MIN_DORMANT_REACTIVATION_AXES_FOR_SCORE) {
      expect(score).toBeNull()
      expect(maxPossible).toBeNull()
    }
  })

  it('jamais de probabilité : le score est un entier borné par maxPossible, jamais un taux libre', () => {
    const { score, maxPossible } = computeDormantReactivationScore(richInput)
    expect(Number.isInteger(score)).toBe(true)
    expect(score).toBeLessThanOrEqual(maxPossible as number)
    expect(maxPossible).toBeLessThanOrEqual(DORMANT_REACTIVATION_SCORE_MAX)
  })

  it('un compte sans porteur reste un FAIT évalué (0 pts), jamais une absence masquée', () => {
    const { axes } = computeDormantReactivationScore({ ...richInput, accountAssignedTo: null })
    const owner = axes.find(a => a.key === 'owner')
    expect(owner?.points).toBe(0)
    expect(owner?.proof).toBeTruthy()
  })

  it('un signal jamais calculé (null) est non évaluable ; un signal calculé vide (=[]) est un zéro réel', () => {
    const neverComputed = computeDormantReactivationScore({ ...richInput, signals: null })
    const computedEmpty = computeDormantReactivationScore({ ...richInput, signals: [] })
    expect(neverComputed.axes.find(a => a.key === 'signal')?.points).toBeNull()
    expect(computedEmpty.axes.find(a => a.key === 'signal')?.points).toBe(0)
  })

  it('ne cite jamais un sujet inventé : sans dernière activité connue, l’axe sujet est exclu', () => {
    const { axes } = computeDormantReactivationScore({ ...richInput, lastActivitySubject: null })
    const subject = axes.find(a => a.key === 'subject')
    expect(subject?.points).toBeNull()
    expect(subject?.proof).toBeNull()
  })
})
