import { describe, expect, it } from 'vitest'
import type { EsnAnswers } from '@bellum/contracts'
import { isEsnProfileIncomplete, summarizeEsnFocus } from './esn-focus'

/** A fully-answered Temps-1 questionnaire — the "complete" baseline. */
const COMPLETE_ANSWERS: EsnAnswers = {
  esn_name: 'Bellum Consulting',
  consultant_size: '50-100',
  sales_team_size: '5-10',
  expertise_areas: ['Cloud & Infrastructure', 'Data & Intelligence Artificielle'],
  positioning: 'expertiseRare',
  target_sectors: ['Banque de détail & Banque privée'],
  target_company_types: ['ETI (500-5 000 salariés)'],
  staffing_model: 'mixed',
  geo_zones: ['Paris & Île-de-France'],
  remote_and_travel_scope: [],
  zone_capability_status: [],
  main_sales_pain: 'cycle long',
  offer_domain: null,
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

describe('summarizeEsnFocus (#1584 — "Ce que Bellum va chercher pour toi")', () => {
  it('reprend expertise / territoire / type de comptes / priorité depuis le profil RÉEL', () => {
    const focus = summarizeEsnFocus(COMPLETE_ANSWERS)
    expect(focus.expertise).toEqual(['Cloud & Infrastructure', 'Data & Intelligence Artificielle'])
    expect(focus.territory).toEqual(['Paris & Île-de-France'])
    expect(focus.accountTypes).toEqual(['ETI (500-5 000 salariés)'])
    expect(focus.priority).toEqual(['Banque de détail & Banque privée'])
  })

  it('rend des listes vides — jamais inventées — sur un profil absent', () => {
    const focus = summarizeEsnFocus(null)
    expect(focus).toEqual({ expertise: [], territory: [], accountTypes: [], priority: [] })
  })

  it('retire les entrées vides et plafonne pour rester compact', () => {
    const focus = summarizeEsnFocus({
      ...COMPLETE_ANSWERS,
      expertise_areas: ['A', '', '  ', 'B', 'C', 'D', 'E'],
    })
    expect(focus.expertise).not.toContain('')
    expect(focus.expertise.length).toBeLessThanOrEqual(3)
  })
})

describe('isEsnProfileIncomplete (#1584 — signaler AVANT le débit)', () => {
  it('faux sur un profil Temps-1 complet', () => {
    expect(isEsnProfileIncomplete(COMPLETE_ANSWERS)).toBe(false)
  })

  it('vrai quand le profil est absent (jamais chargé, ou en échec)', () => {
    expect(isEsnProfileIncomplete(null)).toBe(true)
    expect(isEsnProfileIncomplete(undefined)).toBe(true)
  })

  it('vrai dès qu’un des dix champs requis de Temps 1 manque — même porte que le reste du produit', () => {
    expect(isEsnProfileIncomplete({ ...COMPLETE_ANSWERS, target_sectors: [] })).toBe(true)
    expect(isEsnProfileIncomplete({ ...COMPLETE_ANSWERS, esn_name: null })).toBe(true)
  })
})
