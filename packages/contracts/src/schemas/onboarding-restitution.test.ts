import { describe, expect, it } from 'vitest'
import {
  buildOnboardingRestitution,
  onboardingRestitutionSchema,
  type OnboardingRestitutionInput,
} from './onboarding-restitution.js'
import type { EsnAnswers } from './onboarding.js'

const BASE_INPUT: OnboardingRestitutionInput = {
  answers: null,
  coachingInsights: null,
  hasAccountsToAct: false,
}

describe('buildOnboardingRestitution', () => {
  it('excludes every understanding row whose answer is absent — never renders it at zero/empty (GA-18/GA-19)', () => {
    const result = buildOnboardingRestitution(BASE_INPUT)
    expect(result.understanding).toEqual([])
    expect(onboardingRestitutionSchema.parse(result)).toBeTruthy()
  })

  it('names each of the ten understanding axes present, tagging its provenance', () => {
    const answers: Partial<EsnAnswers> = {
      user_role: 'Dirigeant',
      role_tenure: '3 à 5 ans',
      decisions_alone: ['Tarification', 'Recrutement'],
      team_coordination_mode: 'Réunion hebdomadaire',
      esn_maturity_situation: 'En croissance',
      expertise_areas: ['DevOps', 'Data'],
      target_sectors: ['Banque', 'Assurance'],
      company_locations: ['Paris'],
      consultant_size: '10 à 50 consultants',
      weekly_sales_time_protected: '5 à 10 heures par semaine',
    }
    const result = buildOnboardingRestitution({ ...BASE_INPUT, answers: answers as EsnAnswers })
    const keys = result.understanding.map(r => r.key)
    expect(keys).toEqual([
      'role',
      'experience',
      'scope',
      'organization',
      'companyStage',
      'offer',
      'verticals',
      'territories',
      'consultantModel',
      'salesCapacity',
    ])
    const capacity = result.understanding.find(r => r.key === 'salesCapacity')
    // The one row that is a computed reading of several declared answers,
    // not a single verbatim answer — reuses the canonical `frontsBudget`.
    expect(capacity?.provenance).toBe('observed')
    expect(result.understanding.find(r => r.key === 'role')?.provenance).toBe('declared')
  })

  it('never renders a bottleneck without a mainWeakness, and never invents a second computation for it', () => {
    const result = buildOnboardingRestitution({
      ...BASE_INPUT,
      coachingInsights: { mainWeakness: 'prospection irrégulière', keyAdvice: 'régularité bat intensité' },
      answers: { sales_blockers: ['Pas assez de temps'] } as EsnAnswers,
    })
    expect(result.bottleneck).toEqual({
      headline: 'prospection irrégulière',
      facts: ['Pas assez de temps'],
      hypotheses: ['régularité bat intensité'],
      confidence: 'high',
      impact: [],
      correctable: true,
    })
  })

  it('reports bottleneck as absent, never a placeholder, when Laura has not produced one', () => {
    const result = buildOnboardingRestitution(BASE_INPUT)
    expect(result.bottleneck).toBeNull()
  })

  it('never recommends chasing new accounts before extending an existing portfolio that still needs action', () => {
    const result = buildOnboardingRestitution({ ...BASE_INPUT, hasAccountsToAct: true })
    expect(result.notRecommended).toContain('extendBeforeNew')
    expect(result.priorities[0]).toBe('extendExistingAccounts')
  })

  it('flags a missing offer as both a caution and a priority — never a launched campaign without one', () => {
    const result = buildOnboardingRestitution({
      ...BASE_INPUT,
      answers: { expertise_areas: [] } as unknown as EsnAnswers,
    })
    expect(result.notRecommended).toContain('offerBeforeCampaign')
    expect(result.priorities).toContain('defineOffer')
  })

  it('caps priorities and anti-recommendations at three, per the spec', () => {
    const result = buildOnboardingRestitution({
      ...BASE_INPUT,
      hasAccountsToAct: true,
      answers: {
        expertise_areas: [],
        entry_channels_used: [],
        team_coordination_mode: 'Aucune coordination formalisée',
      } as unknown as EsnAnswers,
    })
    expect(result.notRecommended.length).toBeLessThanOrEqual(3)
    expect(result.priorities.length).toBeLessThanOrEqual(3)
  })

  it('always proposes a first test under fifteen minutes, tied to the top priority', () => {
    const result = buildOnboardingRestitution(BASE_INPUT)
    // No answers at all: every gap fires, so the top (and most urgent)
    // priority is defining an offer before anything else can be tested.
    expect(result.firstTest?.priority).toBe('defineOffer')
    expect(result.firstTest?.estimatedMinutes).toBeLessThanOrEqual(15)
  })

  it('falls back to analyzing a first account once no other priority fires', () => {
    const answers: Partial<EsnAnswers> = { expertise_areas: ['DevOps'], entry_channels_used: ['Réseau personnel'] }
    const result = buildOnboardingRestitution({ ...BASE_INPUT, answers: answers as EsnAnswers })
    expect(result.priorities).toEqual(['analyzeFirstAccount'])
    expect(result.firstTest?.priority).toBe('analyzeFirstAccount')
  })

  it('names what is still missing rather than silently omitting it', () => {
    const result = buildOnboardingRestitution(BASE_INPUT)
    expect(result.gaps).toContain('role')
    expect(result.gaps).toContain('companyStage')
    expect(result.gaps).toContain('revenue')
    expect(result.gaps).toContain('accessPath')
  })

  it('never displays a probability — no field of the schema accepts a percentage-shaped number', () => {
    const shape = onboardingRestitutionSchema.shape
    expect(Object.keys(shape)).not.toContain('probability')
    expect(Object.keys(shape)).not.toContain('score')
  })
})
