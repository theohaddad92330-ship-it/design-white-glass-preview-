import { describe, expect, it } from 'vitest'
import { protectedTimeWorkdayHours, isValidProtectedTime, readProtectedTime } from './protected-time.js'
import { userPreferencesPatchSchema } from './reply-preferences.js'

/**
 * #2101.13/.14/.17 — le temps protégé, vu du contrat.
 *
 * Même promesse que les réglages de réponse : une valeur inconnue ou
 * incohérente n'est jamais DEVINÉE à la lecture, et jamais STOCKÉE à
 * l'écriture.
 */
describe('protected-time — le contrat du temps protégé', () => {
  it('accepte une fenêtre valide, dans la journée', () => {
    expect(isValidProtectedTime({ startMinute: 540, endMinute: 1080 })).toBe(true)
  })

  it('refuse une fenêtre à largeur nulle ou inversée', () => {
    expect(isValidProtectedTime({ startMinute: 540, endMinute: 540 })).toBe(false)
    expect(isValidProtectedTime({ startMinute: 1080, endMinute: 540 })).toBe(false)
  })

  it('refuse une borne hors de la journée', () => {
    expect(isValidProtectedTime({ startMinute: -1, endMinute: 60 })).toBe(false)
    expect(isValidProtectedTime({ startMinute: 60, endMinute: 1441 })).toBe(false)
  })

  it('refuse une forme qui n’est pas un objet, ou des minutes non entières', () => {
    expect(isValidProtectedTime(null)).toBe(false)
    expect(isValidProtectedTime('9h-18h')).toBe(false)
    expect(isValidProtectedTime({ startMinute: 540.5, endMinute: 1080 })).toBe(false)
  })

  it('lit une fenêtre valide, rend null sur un sac absent ou une valeur corrompue', () => {
    expect(readProtectedTime({ protectedTime: { startMinute: 540, endMinute: 1080 } })).toEqual({
      startMinute: 540,
      endMinute: 1080,
    })
    expect(readProtectedTime(null)).toBeNull()
    expect(readProtectedTime({})).toBeNull()
    expect(readProtectedTime({ protectedTime: { startMinute: 'neuf', endMinute: 1080 } })).toBeNull()
  })

  describe('le sac du PATCH', () => {
    it('accepte une fenêtre valide', () => {
      expect(
        userPreferencesPatchSchema.safeParse({ protectedTime: { startMinute: 540, endMinute: 1080 } }).success,
      ).toBe(true)
    })

    it('REFUSE une fenêtre invalide au lieu de la stocker pour rien', () => {
      const result = userPreferencesPatchSchema.safeParse({ protectedTime: { startMinute: 1080, endMinute: 540 } })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.path).toEqual(['protectedTime'])
    })
  })
})

describe('protectedTimeWorkdayHours — #2770.27, les heures de travail de Laura', () => {
  it('une fenêtre pleine heure devient les heures ouvrées, telles quelles', () => {
    expect(protectedTimeWorkdayHours({ startMinute: 540, endMinute: 1080 })).toEqual({
      workdayStartHour: 9,
      workdayEndHour: 18,
    })
  })

  it('arrondit VERS L’INTÉRIEUR : un créneau proposé ne déborde jamais du temps réglé', () => {
    expect(protectedTimeWorkdayHours({ startMinute: 570, endMinute: 1050 })).toEqual({
      workdayStartHour: 10,
      workdayEndHour: 17,
    })
  })

  it('une fenêtre sans heure pleine à l’intérieur ne produit rien — jamais une heure devinée', () => {
    expect(protectedTimeWorkdayHours({ startMinute: 570, endMinute: 630 })).toBeNull()
  })

  it('aucun réglage, aucune heure', () => {
    expect(protectedTimeWorkdayHours(null)).toBeNull()
  })
})
