/**
 * ⚠️ #4016.L9.a revient sur GA-58 et sur le seuil de trois axes (doctrine c26),
 * délibérément — Louis 13/10/2026 (QCM) : « un score s'affiche dès 2 axes
 * évaluables, toujours avec son nombre d'axes ».
 *
 * Ce qui bascule : le plancher passe de 3 à 2. Ce qui ne bascule pas : sous le
 * plancher, PAS de score — un axe seul ne décrit pas un compte.
 */
import { describe, expect, it } from 'vitest'
import { ACCOUNT_SCORE_MIN_EVALUATED_AXES, accountScoreIsShowable } from './account-score.js'
import { DOSSIER_SCORE_MIN_MEASURED_AXES, computeDossierScore } from './analysis/dossier-read.js'

describe('#4016.L9.a — un score de compte s’affiche dès 2 axes évaluables', () => {
  it('le plancher vaut 2, à UN seul endroit (le score du dossier le reprend)', () => {
    expect(ACCOUNT_SCORE_MIN_EVALUATED_AXES).toBe(2)
    expect(DOSSIER_SCORE_MIN_MEASURED_AXES).toBe(ACCOUNT_SCORE_MIN_EVALUATED_AXES)
  })

  it('deux axes évaluables suffisent', () => {
    expect(accountScoreIsShowable(2)).toBe(true)
    expect(accountScoreIsShowable(7)).toBe(true)
  })

  it('SAIT DIRE NON — un seul axe ne fait pas un score, zéro non plus', () => {
    expect(accountScoreIsShowable(1)).toBe(false)
    expect(accountScoreIsShowable(0)).toBe(false)
    expect(accountScoreIsShowable(Number.NaN)).toBe(false)
  })

  it('le score du dossier se calcule sur 2 axes et dit sur combien il repose', () => {
    const score = computeDossierScore([
      { key: 'adequation_offre', state: 'measured', value: 4, impact: null, lever: null },
      { key: 'concurrence', state: 'partial', value: 2, impact: null, lever: null },
    ])
    expect(score).toMatchObject({ kind: 'score', value: 6, outOf: 10, scoredAxes: 2 })
    // …et les cinq autres restent NOMMÉS, jamais comptés pour zéro.
    expect(score.unknownAxes).toHaveLength(5)
  })

  it('SAIT DIRE NON — un dossier à un seul axe n’a pas de score', () => {
    const score = computeDossierScore([
      { key: 'adequation_offre', state: 'measured', value: 5, impact: null, lever: null },
    ])
    expect(score.kind).toBe('insufficient')
    expect(score).not.toHaveProperty('value')
    expect(score.scoredAxes).toBe(1)
  })
})
