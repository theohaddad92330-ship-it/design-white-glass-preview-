import { describe, expect, it } from 'vitest'
import { reviewSignalsSchema } from './review-signals.js'

describe('reviewSignalsSchema (#3262.24-28, + #3277.5)', () => {
  it('accepte les sept comptages mesurés', () => {
    const parsed = reviewSignalsSchema.parse({
      staleFocusCount: 3,
      noGoToRevisitCount: 1,
      accountsWithoutOwnerCount: 5,
      accountsWithoutDateCount: 2,
      strategyNoGoCount: 4,
      strategyBlockedCount: 7,
      accountsWithoutMovementCount: 4,
    })
    expect(parsed.staleFocusCount).toBe(3)
    expect(parsed.strategyNoGoCount).toBe(4)
    expect(parsed.strategyBlockedCount).toBe(7)
    expect(parsed.accountsWithoutMovementCount).toBe(4)
  })

  it('accepte `null` — un échec de lecture, jamais un zéro deviné', () => {
    const parsed = reviewSignalsSchema.parse({
      staleFocusCount: null,
      noGoToRevisitCount: null,
      accountsWithoutOwnerCount: null,
      accountsWithoutDateCount: null,
      strategyNoGoCount: null,
      strategyBlockedCount: null,
      accountsWithoutMovementCount: null,
    })
    expect(parsed.staleFocusCount).toBeNull()
    expect(parsed.strategyNoGoCount).toBeNull()
    expect(parsed.accountsWithoutMovementCount).toBeNull()
  })

  it('refuse un compte négatif', () => {
    expect(() =>
      reviewSignalsSchema.parse({
        staleFocusCount: -1,
        noGoToRevisitCount: 0,
        accountsWithoutOwnerCount: 0,
        accountsWithoutDateCount: 0,
        strategyNoGoCount: 0,
        strategyBlockedCount: 0,
        accountsWithoutMovementCount: 0,
      }),
    ).toThrow()
  })
})
