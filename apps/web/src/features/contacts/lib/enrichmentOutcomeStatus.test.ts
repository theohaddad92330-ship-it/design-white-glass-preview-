import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api'
import { classifyEnrichmentError, classifyEnrichmentOutcome } from './enrichmentOutcomeStatus'

describe('classifyEnrichmentOutcome', () => {
  it('email + phone both found ⇒ matched_both', () => {
    expect(classifyEnrichmentOutcome({ email: 'a@b.com', phone: '+33600000000' })).toBe('matched_both')
  })

  it('email only ⇒ matched_email', () => {
    expect(classifyEnrichmentOutcome({ email: 'a@b.com', phone: null })).toBe('matched_email')
  })

  it('phone only ⇒ matched_phone', () => {
    expect(classifyEnrichmentOutcome({ email: null, phone: '+33600000000' })).toBe('matched_phone')
  })

  it('ambiguous identity wins over everything else', () => {
    expect(
      classifyEnrichmentOutcome({ email: 'a@b.com', phone: '+33600000000', last_enrichment_result: 'ambiguous' }),
    ).toBe('ambiguous')
  })

  it('newer_data_exists is reported even when nothing was written', () => {
    expect(classifyEnrichmentOutcome({ email: null, phone: null, last_enrichment_result: 'newer_data_exists' })).toBe(
      'newer_data_exists',
    )
  })

  it('a known-bounced email with nothing new ⇒ invalid_coordinate', () => {
    expect(classifyEnrichmentOutcome({ email: null, phone: null, email_bounced_at: '2026-09-01T00:00:00Z' })).toBe(
      'invalid_coordinate',
    )
  })

  it('genuinely empty result, no bounce on record ⇒ no_result', () => {
    expect(classifyEnrichmentOutcome({ email: null, phone: null })).toBe('no_result')
  })
})

describe('classifyEnrichmentError', () => {
  it('server opt_out refusal ⇒ opt_out', () => {
    expect(classifyEnrichmentError(new ApiError('refusé', 403, 'opt_out'))).toBe('opt_out')
  })

  // #3698.1 — « crédits » et « service » appellent deux suites différentes :
  // acheter / mettre à niveau d'un côté, réessayer plus tard de l'autre.
  it('credits refused ⇒ insufficient_credits (402, trial_ended)', () => {
    expect(classifyEnrichmentError(new ApiError('épuisés', 402, 'insufficient_credits'))).toBe('insufficient_credits')
    expect(classifyEnrichmentError(new ApiError('essai fini', 402, 'trial_ended'))).toBe('insufficient_credits')
  })

  it('service down on our side or upstream ⇒ service_unavailable, never "buy credits"', () => {
    for (const code of [
      'enrichment_unavailable',
      'upstream_error',
      'quota_exceeded',
      'rate_limited',
      'network_error',
    ]) {
      expect(classifyEnrichmentError(new ApiError('en panne', 503, code))).toBe('service_unavailable')
    }
  })

  it('any other failure ⇒ technical_error, never confused with no_result', () => {
    expect(classifyEnrichmentError(new Error('network down'))).toBe('technical_error')
  })
})
