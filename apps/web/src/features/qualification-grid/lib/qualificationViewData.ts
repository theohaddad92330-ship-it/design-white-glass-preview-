import { checkQualificationWeights, type QualificationAxis, type QualificationCriterion } from '@bellum/contracts'

/**
 * #3755 — ce que l'écran affiche d'une grille et d'une qualification, en
 * fonctions pures (testées). Doctrine : une absence ne s'affiche JAMAIS « 0 »
 * (GA-18/19) — un critère non évaluable est NOMMÉ, sans chiffre ; le score se lit
 * sur le dénominateur évaluable, jamais comme une probabilité (c26).
 */
type AxisValue = { kind: 'points'; text: string } | { kind: 'pass' } | { kind: 'fail' } | { kind: 'not_evaluable' }

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export function axisValue(axis: QualificationAxis): AxisValue {
  if (axis.status === 'not_evaluable') return { kind: 'not_evaluable' }
  if (axis.kind === 'eliminatory') return axis.status === 'fail' ? { kind: 'fail' } : { kind: 'pass' }
  if (axis.points === null || axis.weight === null) return { kind: 'not_evaluable' }
  return { kind: 'points', text: `${fmt(axis.points)} / ${fmt(axis.weight)}` }
}

/** Qui a évalué l'axe — l'analyse ou le commercial — en clé de traduction ; `null` si personne. */
export function axisOriginKey(axis: QualificationAxis): 'account.sourceManual' | 'account.sourceAnalysis' | null {
  if (axis.source === 'manual') return 'account.sourceManual'
  return axis.source === 'analysis' ? 'account.sourceAnalysis' : null
}

/** « 40 / 50 » — ou `null` quand aucun critère pondéré n'a été évalué. */
export function scoreValue(result: { points: number; max: number }): string | null {
  return result.max > 0 ? `${fmt(result.points)} / ${fmt(result.max)}` : null
}

export function gridTotalState(criteria: readonly QualificationCriterion[]) {
  return checkQualificationWeights(criteria)
}

export function emptyCriterion(position: number): QualificationCriterion {
  return {
    code: '',
    label: '',
    kind: 'weighted',
    weight: null,
    category: null,
    description_max: null,
    description_zero: null,
    position,
  }
}
