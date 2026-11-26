import { describe, expect, it } from 'vitest'
import { isAnswerFilled } from './onboarding.js'

/**
 * #2088.12 (DÉCISION Louis 18/09/2026, point 16) — `isAnswerFilled` élargi aux
 * NOMBRES pour `consultant_count` / `annual_revenue_amount`, les deux
 * premiers champs `number` du questionnaire. Avant ce lot, un nombre n'était
 * reconnu par rien : un profil qui aurait répondu « 0 » se serait vu compter
 * comme « pas répondu » par `reconfigurationPlan`
 * (`apps/web/.../onboarding-gate.ts`), la barre de progression et la porte de
 * complétion — trois lecteurs qui appellent tous cette fonction.
 */
describe('isAnswerFilled — les nombres (#2088.12)', () => {
  it('un nombre fini, y compris zéro, compte comme répondu', () => {
    expect(isAnswerFilled(12)).toBe(true)
    expect(isAnswerFilled(850_000)).toBe(true)
    expect(isAnswerFilled(0)).toBe(true)
  })

  it('sait dire NON : NaN et Infinity ne sont pas des réponses', () => {
    expect(isAnswerFilled(Number.NaN)).toBe(false)
    expect(isAnswerFilled(Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('ne casse pas le comportement historique des chaînes et des tableaux', () => {
    expect(isAnswerFilled('Bellum')).toBe(true)
    expect(isAnswerFilled('')).toBe(false)
    expect(isAnswerFilled(null)).toBe(false)
    expect(isAnswerFilled(undefined)).toBe(false)
    expect(isAnswerFilled([])).toBe(false)
    expect(isAnswerFilled(['a'])).toBe(true)
  })
})
