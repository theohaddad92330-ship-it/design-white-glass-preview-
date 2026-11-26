import { describe, expect, it } from 'vitest'
import {
  createDiscoverCandidateFeedbackSchema,
  discoverCandidateFeedbackResponseSchema,
} from './discover-candidate-feedback.js'

describe('createDiscoverCandidateFeedbackSchema', () => {
  it('accepts the wrong_company verdict', () => {
    expect(createDiscoverCandidateFeedbackSchema.parse({ verdict: 'wrong_company' })).toEqual({
      verdict: 'wrong_company',
    })
  })

  it('refuses an unknown verdict — the CHECK in base has not been widened for it', () => {
    expect(() => createDiscoverCandidateFeedbackSchema.parse({ verdict: 'not_interested' })).toThrow()
  })

  it('refuses an unknown field (strict)', () => {
    expect(() => createDiscoverCandidateFeedbackSchema.parse({ verdict: 'wrong_company', note: 'x' })).toThrow()
  })
})

describe('discoverCandidateFeedbackResponseSchema', () => {
  it('round-trips a recorded feedback', () => {
    const value = { siren: '552032534', verdict: 'wrong_company' as const, recordedAt: '2026-10-08T00:00:00.000Z' }
    expect(discoverCandidateFeedbackResponseSchema.parse(value)).toEqual(value)
  })
})
