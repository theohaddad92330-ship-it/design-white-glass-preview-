import { describe, expect, it } from 'vitest'
import { contactIdentityAmbiguous } from './contactIdentityAmbiguous'

describe('contactIdentityAmbiguous (#3687.13)', () => {
  it('last_enrichment_result ambiguous → true', () => {
    expect(contactIdentityAmbiguous({ last_enrichment_result: 'ambiguous' })).toBe(true)
  })

  it('matched, no_new_data, newer_data_exists, null, undefined → false', () => {
    expect(contactIdentityAmbiguous({ last_enrichment_result: 'matched' })).toBe(false)
    expect(contactIdentityAmbiguous({ last_enrichment_result: 'no_new_data' })).toBe(false)
    expect(contactIdentityAmbiguous({ last_enrichment_result: 'newer_data_exists' })).toBe(false)
    expect(contactIdentityAmbiguous({ last_enrichment_result: null })).toBe(false)
    expect(contactIdentityAmbiguous({ last_enrichment_result: undefined })).toBe(false)
  })
})
