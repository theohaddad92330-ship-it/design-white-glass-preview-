import { describe, expect, it } from 'vitest'
import { discoverCandidateSchema, discoverResponseSchema } from './discover.js'
import { candidateProvenBySkill, discoverSkillIntermediarySchema } from './discover-skill-evidence.js'

// COMPETENCE-TROUVE (Louis 20/10/2026) — une compétence posée TROUVE les comptes par leurs offres.
const evidence = {
  skill: 'SAP',
  offerCount: 2,
  latestOffer: {
    title: 'Business Analyst SAP SD H/F',
    city: 'Bartenheim',
    date: '2026-10-16',
    url: 'https://offres.example/1',
    source: 'france_travail',
  },
}

describe('COMPETENCE-TROUVE — la preuve par offres voyage dans le contrat', () => {
  it('la réponse garde `skillEvidence` sur un candidat et `skillIntermediaries` à part', () => {
    const parsed = discoverResponseSchema.parse({
      candidates: [
        {
          name: 'BIHR',
          siren: '433091839',
          nafCode: '46.69B',
          sector: null,
          city: 'BARTENHEIM',
          department: '68',
          headcountRange: null,
          creationDate: null,
          score: null,
          scoreFactors: [],
          signals: [],
          angle: null,
          suggestedRoles: [],
          portfolioState: 'new',
          accountId: null,
          sources: [],
          skillEvidence: evidence,
        },
      ],
      query: {},
      degraded: [],
      skillIntermediaries: [
        {
          siren: '512345678',
          name: 'SIGNE +',
          kind: 'recruiter',
          city: 'PARIS',
          department: '75',
          skillEvidence: evidence,
        },
      ],
    })
    expect(parsed.candidates[0]?.skillEvidence?.offerCount).toBe(2)
    expect(parsed.skillIntermediaries?.[0]?.kind).toBe('recruiter')
  })

  it('un intermédiaire n’a que deux natures — la garde sait dire NON', () => {
    expect(() =>
      discoverSkillIntermediarySchema.parse({ siren: '1', name: 'X', kind: 'client', skillEvidence: evidence }),
    ).toThrow()
  })

  it('un compte est prouvé par offre sur la techno demandée, pas sur une autre', () => {
    const candidate = discoverCandidateSchema.partial().parse({ skillEvidence: evidence })
    expect(candidateProvenBySkill(candidate, ['sap'])).toBe(true)
    expect(candidateProvenBySkill(candidate, ['salesforce'])).toBe(false)
    expect(candidateProvenBySkill({}, ['sap'])).toBe(false)
    expect(candidateProvenBySkill({ skillEvidence: { ...evidence, offerCount: 0 } }, ['sap'])).toBe(false)
  })
})
