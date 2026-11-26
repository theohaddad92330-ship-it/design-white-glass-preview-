import { describe, expect, it } from 'vitest'

import wire from '../fixtures/company-suggestions.ia.json'
import { companySearchResponseSchema, companySuggestionSchema } from './companies.js'

/**
 * End-to-end SHAPE guard for the company autocomplete (web → NestJS → IA).
 *
 * Why it exists: `registryId` / `registryIdLabel` shipped broken while every
 * suite was green. The IA emitted `registry_id` (snake_case), this contract
 * declared `registryId` (camelCase), and nothing compared the two — the Python
 * tests asserted the Python shape, and `companies.service.spec.ts` asserted the
 * TS shape against a hand-written mock of the IA client. Both sides were
 * self-consistent and both were testing their own assumption.
 *
 * The fixture parsed below is the RAW FastAPI response body, pinned on the
 * Python side by `apps/ia/tests/test_companies_wire_contract.py`. Renaming a
 * field in either language now fails the other language's suite.
 *
 * Note the deliberate use of `.strict()`. A plain `.parse()` would NOT have
 * caught the original bug: `z.object` STRIPS unknown keys by default, so a
 * payload carrying `registry_id` and no `registryId` parses happily — the
 * unknown key is discarded and the declared one is merely `.optional()`.
 * Strict mode is what turns "silently dropped" into "loudly rejected", and it
 * covers every field of the object rather than the two this bug touched.
 */
describe('company suggestions — IA wire fixture', () => {
  const paths = [
    { path: 'fr', fixture: wire.fr },
    { path: 'us', fixture: wire.us },
  ] as const

  for (const { path, fixture } of paths) {
    describe(`${path} path`, () => {
      it('parses against companySearchResponseSchema', () => {
        expect(companySearchResponseSchema.safeParse(fixture).success).toBe(true)
      })

      it('has every suggestion key declared by the contract (strict — no silent drop)', () => {
        for (const suggestion of fixture.suggestions) {
          const result = companySuggestionSchema.strict().safeParse(suggestion)
          // Surfacing the offending key makes a casing drift self-explanatory.
          expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true)
        }
      })
    })
  }

  it('carries the national registry identity on the country-pack path', () => {
    // The whole point of the non-FR path: abroad there is NO SIREN, so
    // `registryId` is the only stable identity pivot the suggestion has.
    const [apple] = wire.us.suggestions
    const parsed = companySuggestionSchema.parse(apple)
    expect(parsed.siren).toBe('')
    expect(parsed.registryId).toBe('0000320193')
    expect(parsed.registryIdLabel).toBe('CIK')
    expect(parsed.country).toBe('US')
  })

  it('leaves the FR path free of cross-border identity', () => {
    const [capgemini] = wire.fr.suggestions
    const parsed = companySuggestionSchema.parse(capgemini)
    expect(parsed.siren).toBe('330703844')
    expect(parsed.registryId ?? null).toBeNull()
    expect(parsed.country ?? null).toBeNull()
  })

  it('keeps consuming the snake_case registry-provenance fields', () => {
    // `postal_code` / `employees_min` / `employees_max` are deliberately NOT
    // camelCase: `similar-scoring.ts` reads them under these exact names. This
    // asserts the registry-casing fix did not re-case its neighbours.
    for (const fixtureBody of [wire.fr, wire.us]) {
      for (const suggestion of fixtureBody.suggestions) {
        expect(suggestion).toHaveProperty('postal_code')
        expect(suggestion).toHaveProperty('employees_min')
        expect(suggestion).toHaveProperty('employees_max')
      }
    }
  })

  it('rejects the snake_case shape that shipped broken (regression lock)', () => {
    // The exact body the IA used to return. It MUST NOT be contract-legal.
    const legacy = {
      name: 'Apple Inc.',
      siren: '',
      city: 'Cupertino, CA',
      sector: '',
      postal_code: null,
      employees_min: null,
      employees_max: null,
      country: 'US',
      registry_id: '0000320193',
      registry_id_label: 'CIK',
    }
    expect(companySuggestionSchema.strict().safeParse(legacy).success).toBe(false)
    // And the reason it was invisible: non-strict parsing swallows it whole.
    const lenient = companySuggestionSchema.parse(legacy)
    expect(lenient.registryId).toBeUndefined()
  })
})
