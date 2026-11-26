import { describe, expect, it } from 'vitest'
import { monthCoverage, weekDeltaQuerySchema, workingDaysLeftInMonth } from './week-delta.js'

describe('workingDaysLeftInMonth', () => {
  it('compte lun-ven, aujourd’hui compris', () => {
    // Mercredi 14 octobre 2026 → 14,15,16 / 19-23 / 26-30 = 3 + 5 + 5
    expect(workingDaysLeftInMonth(new Date('2026-10-14T10:00:00Z'))).toBe(13)
  })
  it('un samedi de fin de mois : 0', () => {
    expect(workingDaysLeftInMonth(new Date('2026-10-31T10:00:00Z'))).toBe(0)
  })
})

describe('monthCoverage', () => {
  it('couverture = pipe ouvert ÷ reste, rythme = reste ÷ jours ouvrés', () => {
    expect(monthCoverage({ target: 100_000, realised: 40_000, openPipe: 90_000, workingDaysLeft: 10 })).toEqual({
      remaining: 60_000,
      coverage: 1.5,
      expectedPacePerDay: 6_000,
    })
  })
  it('sans objectif : aucun chiffre inventé', () => {
    expect(monthCoverage({ target: null, realised: 40_000, openPipe: 90_000, workingDaysLeft: 10 })).toEqual({
      remaining: null,
      coverage: null,
      expectedPacePerDay: null,
    })
  })
  it('objectif atteint : reste 0, pas de couverture, rythme 0', () => {
    expect(monthCoverage({ target: 100, realised: 150, openPipe: 10, workingDaysLeft: 5 })).toEqual({
      remaining: 0,
      coverage: null,
      expectedPacePerDay: 0,
    })
  })
  it('pipe illisible : couverture null, jamais 0', () => {
    expect(monthCoverage({ target: 100, realised: 0, openPipe: null, workingDaysLeft: 5 }).coverage).toBeNull()
  })
  it('plus de jour ouvré : rythme null', () => {
    expect(monthCoverage({ target: 100, realised: 0, openPipe: 10, workingDaysLeft: 0 }).expectedPacePerDay).toBeNull()
  })
})

describe('weekDeltaQuerySchema', () => {
  it('refuse from ≥ to', () => {
    expect(weekDeltaQuerySchema.safeParse({ from: '2026-10-10T00:00:00Z', to: '2026-10-01T00:00:00Z' }).success).toBe(
      false,
    )
  })
})
