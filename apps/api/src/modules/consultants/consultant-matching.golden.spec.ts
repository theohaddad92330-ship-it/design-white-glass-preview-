import type { Consultant } from '@bellum/contracts'
import { consultantMatchVerdict, matchConsultant, type MatchTarget } from './consultant-matching'

/**
 * GOLDEN SET — MATCHING BESOIN/CONSULTANT (#2936, #2176.63).
 *
 * `consultant-matching.spec.ts` verrouille les RÈGLES, une par une (must-have,
 * preuve, disponibilité…). Ce fichier verrouille autre chose : des scénarios
 * RÉALISTES et STABLES, chacun avec le verdict qu'un recruteur attend en les
 * lisant — le critère de recette #6 de #2176 (« golden set métier avec
 * profils attendus et contre-exemples »). Une régression future qui ferait
 * apparaître un profil non défendable dans le top, ou disparaître un profil
 * attendu, casse ICI — pas seulement dans une règle unitaire isolée.
 *
 * Chaque scénario porte son VERDICT ATTENDU, dérivé du score ET du blocage
 * par `consultantMatchVerdict` — jamais un score brut lu seul (doctrine
 * « un score n'est jamais nu »).
 */

const BESOIN: MatchTarget = {
  label: 'Renfort SOC après incident de sécurité',
  detail: 'Supervision Splunk à reprendre, astreinte incluse',
  offer: 'Cybersécurité',
  sector: 'Banque',
  zone: 'IDF',
  mustHaveSkills: ['Cybersécurité', 'SOC'],
}

const base = (over: Partial<Consultant>): Consultant => ({
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: null,
  kind: 'consultant',
  source: null,
  last_contact_at: null,
  archived_at: null,
  archived_reason: null,
  review_status: 'qualified' as const,
  consent: { givenAt: null, expiresAt: null, basis: null, restrictions: null },
  full_name: 'Profil de référence',
  title: 'Ingénieur(e) sécurité',
  seniority: 'senior',
  years_experience: null,
  availability: 'immediate',
  available_from: null,
  contract_type: 'cdi',
  engagement_kind: 'salarie' as const,
  partner_account_id: null,
  contact_visible: true,
  finance_visible: true,
  tjm: 620,
  stack: ['Cybersécurité', 'SOC', 'Splunk'],
  sectors: ['Banque'],
  zones: ['IDF'],
  education: [],
  mobility: {
    zones: null,
    remote: null,
    travel: null,
    relocation: null,
    siteFrequency: null,
    international: null,
    restrictions: null,
  },
  process: { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null },
  positioningAgreement: { tjmValidatedAt: null, cvValidatedAt: null, otherProcessesKnown: false },
  preferences: { wantedSectors: [], refusedSectors: [], refusedTechnologies: [], wantedContractKinds: [] },
  references: ['SOC 24/7 pour un assureur'],
  languages: [],
  clearances: [],
  wants: null,
  notes: null,
  cv_text: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  ...over,
})

describe('Golden set — profils attendus', () => {
  it('senior SOC disponible tout de suite, stack et secteur alignés : fortement défendable', () => {
    const match = matchConsultant(
      base({ full_name: 'Nadia Fournier', seniority: 'senior', availability: 'immediate' }),
      BESOIN,
    )
    expect(consultantMatchVerdict(match)).toBe('fortement_defendable')
    // Le score est RECONSTRUCTIBLE : chaque ligne du détail porte sa preuve.
    expect(match.breakdown.every(item => item.proof.length > 0)).toBe(true)
  })

  it('même stack, mais hors zone et disponibilité incertaine : à qualifier, pas écarté', () => {
    const match = matchConsultant(
      base({ full_name: 'Karim Belhadj', availability: 'sous_3_mois', zones: ['PACA'], tjm: 900 }),
      BESOIN,
    )
    expect(consultantMatchVerdict(match)).toBe('a_qualifier')
  })
})

describe('Golden set — contre-exemples', () => {
  it('titre évocateur mais aucune compétence déclarée, secteur et zone hors sujet : non défendable', () => {
    // Doctrine « un CV mentionnant un mot-clé n'est pas une preuve suffisante » —
    // ici le TITRE seul, sans qu'aucune compétence ne soit déclarée, cumulé à
    // un secteur et une zone qui ne collent pas non plus au besoin.
    const match = matchConsultant(
      base({
        full_name: 'Profil sans preuve',
        stack: [],
        sectors: ['Retail'],
        zones: ['PACA'],
        references: [],
        availability: 'sous_3_mois',
      }),
      BESOIN,
    )
    expect(match.blocked).toBe(true)
    expect(consultantMatchVerdict(match)).toBe('non_defendable')
  })

  it('stack parfaite mais indisponible : jamais un profil qu’on ne peut pas présenter', () => {
    const match = matchConsultant(base({ full_name: 'Profil indisponible', availability: 'indisponible' }), BESOIN)
    expect(match.blocked).toBe(true)
    expect(consultantMatchVerdict(match)).not.toBe('fortement_defendable')
  })
})
