import { describe, expect, it } from 'vitest'
import { addDays, availabilityAfterEnd, endMissionInputSchema, extendMissionInputSchema } from './mission-lifecycle.js'

describe('availabilityAfterEnd — le consultant redevient disponible le lendemain de la fin', () => {
  it('fin passée ou aujourd’hui ⇒ immediate', () => {
    expect(availabilityAfterEnd('2026-10-14', '2026-10-14')).toEqual({
      availability: 'immediate',
      availableFrom: '2026-10-15',
    })
    expect(availabilityAfterEnd('2026-09-01', '2026-10-14').availability).toBe('immediate')
  })
  it('fin dans ≤ 31 jours ⇒ sous_1_mois, au-delà ⇒ sous_3_mois', () => {
    expect(availabilityAfterEnd('2026-11-14', '2026-10-14').availability).toBe('sous_1_mois')
    expect(availabilityAfterEnd('2026-11-15', '2026-10-14').availability).toBe('sous_3_mois')
  })
  it('addDays passe la fin de mois et d’année', () => {
    expect(addDays('2027-03-31', 1)).toBe('2027-04-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('schémas d’entrée', () => {
  it('terminer exige une date et un motif typé', () => {
    expect(endMissionInputSchema.safeParse({ endedOn: '2026-10-14', reason: 'date_prevue' }).success).toBe(true)
    expect(endMissionInputSchema.safeParse({ endedOn: '2026-10-14', reason: 'au_hasard' }).success).toBe(false)
  })
  it('prolonger exige une preuve', () => {
    expect(extendMissionInputSchema.safeParse({ newEndsOn: '2027-03-31', proof: '  ' }).success).toBe(false)
    expect(extendMissionInputSchema.safeParse({ newEndsOn: '2027-03-31', proof: 'Avenant n°2' }).success).toBe(true)
  })
})
