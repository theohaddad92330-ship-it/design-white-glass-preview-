import { describe, expect, it } from 'vitest'
import { namedAccountVerdict, NAMED_ACCOUNT_VERDICTS } from './account-score.js'

/**
 * #2932 — mirror TS de `named_verdict()` (`apps/ia/app/services/account_score.py`,
 * testé par `test_account_named_verdict.py`). L'épopée #2304.12-.16 a livré les
 * cinq catégories métier côté IA, mais aucun écran web ne les projetait : le
 * badge « Verdict » (fiche compte) restait sur `accountDisplayVerdict`, qui
 * replie STOP sur l'ancien libellé legacy `NO-GO`. Constaté en recette écran
 * le 27/09/2026 sur une analyse fraîche de Capital Recrutement.
 */
describe('namedAccountVerdict — les cinq catégories métier (#2932)', () => {
  it('porte exactement les cinq libellés de l’épopée', () => {
    expect(NAMED_ACCOUNT_VERDICTS).toEqual([
      'AGIR MAINTENANT',
      'QUALIFIER',
      'RÉSERVE',
      'METTRE EN VEILLE',
      'ÉCARTER POUR CET OBJECTIF',
    ])
  })

  it('GO devient AGIR MAINTENANT', () => {
    expect(namedAccountVerdict('GO', false)).toBe('AGIR MAINTENANT')
  })

  it('PRUDENT devient RÉSERVE', () => {
    expect(namedAccountVerdict('PRUDENT', false)).toBe('RÉSERVE')
  })

  it('EXPLORER devient QUALIFIER', () => {
    expect(namedAccountVerdict('EXPLORER', false)).toBe('QUALIFIER')
  })

  it('NO-GO (STOP) avec déclencheur devient METTRE EN VEILLE', () => {
    expect(namedAccountVerdict('NO-GO', true)).toBe('METTRE EN VEILLE')
  })

  it('NO-GO (STOP) sans déclencheur devient ÉCARTER POUR CET OBJECTIF', () => {
    expect(namedAccountVerdict('NO-GO', false)).toBe('ÉCARTER POUR CET OBJECTIF')
  })
})

/**
 * #3818 — sans objectif renseigné dans l'espace, jamais « ÉCARTER POUR CET
 * OBJECTIF » : trois issues distinctes à la place, jamais fondues.
 */
describe('namedAccountVerdict — sans objectif renseigné (#3818)', () => {
  it('un STOP mesuré, sans objectif, ne dit jamais ÉCARTER POUR CET OBJECTIF', () => {
    const verdict = namedAccountVerdict('NO-GO', false, { hasObjective: false })
    expect(verdict).not.toBe('ÉCARTER POUR CET OBJECTIF')
    expect(verdict).toBe('ÉVALUATION PERSONNALISÉE INDISPONIBLE — ZÉRO MESURÉ')
  })

  it('source en panne et zéro mesuré sont deux libellés distincts', () => {
    const sourceDown = namedAccountVerdict('NO-GO', false, { hasObjective: false, dataComplete: false })
    const zeroMeasured = namedAccountVerdict('NO-GO', false, { hasObjective: false, dataComplete: true })
    expect(sourceDown).toBe('ÉVALUATION PERSONNALISÉE INDISPONIBLE — SOURCE EN PANNE')
    expect(zeroMeasured).toBe('ÉVALUATION PERSONNALISÉE INDISPONIBLE — ZÉRO MESURÉ')
    expect(sourceDown).not.toBe(zeroMeasured)
  })

  it('un déclencheur reste un écartement légitime, nommé, même sans objectif', () => {
    expect(namedAccountVerdict('NO-GO', true, { hasObjective: false })).toBe('INCOMPATIBILITÉ ÉTABLIE')
  })

  it('avec objectif (comportement par défaut), rien ne change', () => {
    expect(namedAccountVerdict('NO-GO', false, { hasObjective: true })).toBe('ÉCARTER POUR CET OBJECTIF')
    expect(namedAccountVerdict('NO-GO', true, { hasObjective: true })).toBe('METTRE EN VEILLE')
    expect(namedAccountVerdict('NO-GO', false)).toBe('ÉCARTER POUR CET OBJECTIF')
  })

  it('GO / PRUDENT / EXPLORER ignorent hasObjective', () => {
    expect(namedAccountVerdict('GO', false, { hasObjective: false })).toBe('AGIR MAINTENANT')
    expect(namedAccountVerdict('PRUDENT', false, { hasObjective: false })).toBe('RÉSERVE')
    expect(namedAccountVerdict('EXPLORER', false, { hasObjective: false })).toBe('QUALIFIER')
  })
})
