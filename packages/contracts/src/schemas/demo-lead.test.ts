import { describe, expect, it } from 'vitest'
import { DEMO_LEAD_JOB_TITLES, demoLeadFormSchema } from './demo-lead.js'

const VALID = {
  firstName: 'Marie',
  lastName: 'Dupont',
  email: 'marie.dupont@acme.fr',
  jobTitle: 'sales_director' as const,
  company: 'Acme',
}

describe('demoLeadFormSchema', () => {
  it('accepte un lead complet, téléphone et UTM compris', () => {
    const result = demoLeadFormSchema.safeParse({
      ...VALID,
      phone: '+33 6 12 34 56 78',
      utmSource: 'linkedin',
      utmCampaign: 'lancement',
    })
    expect(result.success).toBe(true)
  })

  it('accepte un lead sans téléphone ni UTM — le téléphone reste facultatif', () => {
    expect(demoLeadFormSchema.safeParse(VALID).success).toBe(true)
  })

  it('refuse une adresse personnelle', () => {
    const result = demoLeadFormSchema.safeParse({ ...VALID, email: 'marie@gmail.com' })
    expect(result.success).toBe(false)
  })

  it('refuse une fonction hors de la liste fermée', () => {
    const result = demoLeadFormSchema.safeParse({ ...VALID, jobTitle: 'ceo' })
    expect(result.success).toBe(false)
  })

  for (const field of ['firstName', 'lastName', 'company'] as const) {
    it(`refuse un champ obligatoire vide : ${field}`, () => {
      const result = demoLeadFormSchema.safeParse({ ...VALID, [field]: '' })
      expect(result.success).toBe(false)
    })
  }

  it('les sept fonctions sont exactement celles de #2705', () => {
    expect(DEMO_LEAD_JOB_TITLES).toEqual([
      'business_developer',
      'team_manager',
      'agency_director',
      'sales_director',
      'esn_founder',
      'freelance',
      'other',
    ])
  })
})
