import { describe, expect, it } from 'vitest'

import {
  DEFAULT_OFFER_DOMAIN,
  OFFER_DOMAINS,
  TEMPS1_REQUIRED_KEYS,
  esnAnswersSchema,
  offerDomainSchema,
  saveAnswersSchema,
} from './onboarding.js'

const BASE = {
  esn_name: 'Acme',
  consultant_size: '10-30',
  sales_team_size: '2-3 personnes',
  expertise_areas: ['Data & Intelligence Artificielle'],
  positioning: 'Expertise de niche',
  target_sectors: ['Fintech & Services financiers'],
  target_company_types: ['PME (50-500 salariés)'],
  staffing_model: 'Uniquement des CDI internes',
  geo_zones: ['Paris & Île-de-France'],
  main_sales_pain: 'Trouver les bons comptes à cibler',
}

describe('offer_domain (PDF6 §1 — domaine d’offre pluggable)', () => {
  it('accepts every registered domain and defaults to esn_it', () => {
    expect(OFFER_DOMAINS).toContain(DEFAULT_OFFER_DOMAIN)
    for (const domain of OFFER_DOMAINS) {
      expect(offerDomainSchema.parse(domain)).toBe(domain)
    }
  })

  it('absorbs a MISSING offer_domain as null (deploy skew: older API rows)', () => {
    const parsed = esnAnswersSchema.parse(BASE)
    expect(parsed.offer_domain).toBeNull()
  })

  it('absorbs an UNKNOWN offer_domain as null (deploy skew: newer API, older web)', () => {
    const parsed = esnAnswersSchema.parse({ ...BASE, offer_domain: 'quantum_computing' })
    expect(parsed.offer_domain).toBeNull()
  })

  it("absorbs the autosave '' as null (never a 400 on the profile editor)", () => {
    const parsed = saveAnswersSchema.parse({ offer_domain: '' })
    expect(parsed.offer_domain).toBeNull()
  })

  it('keeps a valid explicit domain', () => {
    expect(esnAnswersSchema.parse({ ...BASE, offer_domain: 'finance' }).offer_domain).toBe('finance')
    expect(saveAnswersSchema.parse({ offer_domain: 'esn_it' }).offer_domain).toBe('esn_it')
  })

  it('is NOT part of the Temps-1 completion gate (default behaviour unchanged)', () => {
    expect(TEMPS1_REQUIRED_KEYS).not.toContain('offer_domain')
  })
})
