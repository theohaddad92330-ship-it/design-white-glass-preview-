import { describe, expect, it } from 'vitest'
import { activeAnalysisRunSchema } from './active-analysis-run.js'

describe('activeAnalysisRunSchema', () => {
  it('accepte un job en cours', () => {
    const parsed = activeAnalysisRunSchema.parse({
      account_id: '11111111-1111-1111-1111-111111111111',
      company_name: 'Thales',
      started_at: '2026-09-26T08:00:00.000Z',
    })
    expect(parsed.company_name).toBe('Thales')
  })

  it('refuse un id de compte qui n’est pas un uuid — jamais une donnée devinée', () => {
    expect(() =>
      activeAnalysisRunSchema.parse({ account_id: 'not-a-uuid', company_name: 'Thales', started_at: '2026-09-26' }),
    ).toThrow()
  })
})
