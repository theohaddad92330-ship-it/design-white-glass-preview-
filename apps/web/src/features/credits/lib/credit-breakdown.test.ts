import { describe, expect, it } from 'vitest'
import type { UserCredits } from '@/features/credits/api'
import { creditBreakdown } from './credit-breakdown'

const base = (over: Partial<UserCredits>): UserCredits => ({
  user_id: 'u-1',
  plan: 'trial',
  accounts_limit: 3,
  accounts_used: 0,
  enrichment_credits: 0,
  ...over,
})

describe('creditBreakdown (P0-07)', () => {
  it('splits the cap into plan-included vs one-off top-up', () => {
    // The « 39 » case: 3 included + 36 top-up.
    const b = creditBreakdown(base({ accounts_limit: 39, topup_analyses: 36, accounts_used: 5 }))
    expect(b.total).toBe(39)
    expect(b.planIncluded).toBe(3)
    expect(b.topup).toBe(36)
    expect(b.remaining).toBe(34)
    expect(b.isUnlimited).toBe(false)
  })

  it('treats a missing top-up as zero (whole cap is plan-included)', () => {
    const b = creditBreakdown(base({ accounts_limit: 120, accounts_used: 20 }))
    expect(b.topup).toBe(0)
    expect(b.planIncluded).toBe(120)
    expect(b.remaining).toBe(100)
  })

  it('reports unlimited as null totals, never a raw 999999', () => {
    const b = creditBreakdown(base({ accounts_limit: 999_999, topup_analyses: 0, accounts_used: 4 }))
    expect(b.isUnlimited).toBe(true)
    expect(b.total).toBeNull()
    expect(b.remaining).toBeNull()
  })

  it('never goes negative (over-used cap or oversized top-up)', () => {
    const b = creditBreakdown(base({ accounts_limit: 10, topup_analyses: 20, accounts_used: 15 }))
    expect(b.remaining).toBe(0)
    expect(b.planIncluded).toBe(0)
  })
})
