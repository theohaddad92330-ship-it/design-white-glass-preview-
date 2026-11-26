import { describe, expect, it } from 'vitest'
import { TALENTS_TABS, talentsTabFromHash } from './talentsTabs'

/** #4528.1 (Louis 24/10/2026, revient sur #4502 côté Talents) — Talents garde la personne : Vivier · Recrutement. */
describe('talentsTabs', () => {
  it('deux onglets, pas de présentations', () => {
    expect(TALENTS_TABS).toEqual(['vivier', 'recrutement'])
  })

  it('#recrutement ouvre Recrutement', () => {
    expect(talentsTabFromHash('#recrutement')).toBe('recrutement')
  })

  it('une ancre inconnue — dont #positionnements — ouvre le Vivier', () => {
    expect(talentsTabFromHash('#positionnements')).toBe('vivier')
    expect(talentsTabFromHash('#nimporte')).toBe('vivier')
    expect(talentsTabFromHash('')).toBe('vivier')
  })
})
