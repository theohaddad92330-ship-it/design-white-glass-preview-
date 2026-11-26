import { describe, expect, it } from 'vitest'
import type { EsnAnswers } from '@bellum/contracts'
import { WELCOME_SUMMARY_FALLBACK, toWelcomeProfileSummary } from './toWelcomeProfileSummary'

const fullAnswers: EsnAnswers = {
  esn_name: 'Acme Consulting',
  consultant_size: '30-80',
  sales_team_size: '4-8 personnes',
  expertise_areas: ['Cloud & Infrastructure', 'Data & IA', 'Cybersécurité'],
  positioning: 'Multi-compétences ciblées',
  target_sectors: ['Banque de détail', 'Assurance & Mutuelles'],
  target_company_types: ['ETI (500-5 000 salariés)'],
  staffing_model: 'Mix équilibré CDI / Freelances',
  geo_zones: ['Paris & Île-de-France'],
  remote_and_travel_scope: [],
  zone_capability_status: [],
  main_sales_pain: 'Trouver les bons comptes à cibler',
  offer_domain: 'esn_it',
  offer_domains: [],
  recruits_for_clients: null,
  // Lot 26 — champs additifs, non pertinents pour ce test.
  service_types: [],
  service_types_proven: [],
  service_types_desired: [],
  reference_sectors: [],
  case_study_results: [],
  reference_accounts: [],
  client_testimonials: [],
  expertise_no_concrete_proof: [],
  expertise_client_reference: [],
  expertise_personal_experience: [],
  expertise_partner: [],
  expertise_talent_pool: [],
  staffing_modes: [],
  profile_validation_methods: [],
  contractual_constraints: [],
  priority_sectors: [],
  // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée.
  company_locations: [],
  // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — non pertinents pour ce test.
  consultant_count: null,
  annual_revenue_amount: null,
  annual_revenue_period: null,
  // #2640.2 — non pertinent pour ce test.
  esn_website: null,
}

describe('toWelcomeProfileSummary', () => {
  it('maps a complete profile to four labelled rows', () => {
    const rows = toWelcomeProfileSummary(fullAnswers)
    expect(rows).toEqual([
      { label: "Nom de l'ESN", value: 'Acme Consulting' },
      { label: 'Taille', value: '30-80 consultants' },
      { label: "Domaines d'expertise", value: 'Cloud & Infrastructure · Data & IA · Cybersécurité' },
      {
        label: 'Secteurs & comptes ciblés',
        value: 'Banque de détail · Assurance & Mutuelles · ETI (500-5 000 salariés)',
      },
    ])
  })

  it('falls back gracefully when answers are undefined', () => {
    const rows = toWelcomeProfileSummary(undefined)
    expect(rows).toHaveLength(4)
    expect(rows.every(r => r.value === WELCOME_SUMMARY_FALLBACK)).toBe(true)
  })

  it('treats blank strings and empty arrays as missing', () => {
    const rows = toWelcomeProfileSummary({
      ...fullAnswers,
      esn_name: '   ',
      consultant_size: null,
      expertise_areas: [],
      target_sectors: [],
      target_company_types: [],
    })
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]))
    expect(byLabel["Nom de l'ESN"]).toBe(WELCOME_SUMMARY_FALLBACK)
    expect(byLabel['Taille']).toBe(WELCOME_SUMMARY_FALLBACK)
    expect(byLabel["Domaines d'expertise"]).toBe(WELCOME_SUMMARY_FALLBACK)
    expect(byLabel['Secteurs & comptes ciblés']).toBe(WELCOME_SUMMARY_FALLBACK)
  })

  it('caps multi-selects at three items with a "+N" overflow marker', () => {
    const rows = toWelcomeProfileSummary({
      ...fullAnswers,
      expertise_areas: ['A', 'B', 'C', 'D', 'E'],
      target_sectors: ['S1', 'S2'],
      target_company_types: ['T1', 'T2', 'T3'],
    })
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]))
    expect(byLabel["Domaines d'expertise"]).toBe('A · B · C +2')
    expect(byLabel['Secteurs & comptes ciblés']).toBe('S1 · S2 · T1 +2')
  })
})
