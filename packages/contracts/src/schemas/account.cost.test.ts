import { describe, expect, it } from 'vitest'
import { accountCostSummarySchema } from './account.js'

// Cost transparency per account (Drive backlog #12 — Matteo gap-analysis). The
// schema is the wire contract for GET /accounts/:id/cost: it must accept the
// tracked figures (incl. nulls for untracked legacy rows) and reject nonsense.
describe('accountCostSummarySchema', () => {
  const base = {
    account_id: '11111111-1111-1111-1111-111111111111',
    api_cost_euros: 0.42,
    analyses_count: 3,
    total_run_cost_euros: 1.23,
    last_run_cost_euros: 0.42,
  }

  it('accepts a fully-populated cost summary', () => {
    expect(accountCostSummarySchema.parse(base)).toEqual(base)
  })

  it('accepts null costs (legacy account with no tracked run cost yet)', () => {
    const parsed = accountCostSummarySchema.parse({
      ...base,
      api_cost_euros: null,
      total_run_cost_euros: null,
      last_run_cost_euros: null,
      analyses_count: 0,
    })
    expect(parsed.api_cost_euros).toBeNull()
    expect(parsed.total_run_cost_euros).toBeNull()
    expect(parsed.last_run_cost_euros).toBeNull()
    expect(parsed.analyses_count).toBe(0)
  })

  it('rejects a non-uuid account_id', () => {
    expect(() => accountCostSummarySchema.parse({ ...base, account_id: 'not-a-uuid' })).toThrow()
  })

  it('rejects a negative or fractional analyses_count', () => {
    expect(() => accountCostSummarySchema.parse({ ...base, analyses_count: -1 })).toThrow()
    expect(() => accountCostSummarySchema.parse({ ...base, analyses_count: 2.5 })).toThrow()
  })
})
