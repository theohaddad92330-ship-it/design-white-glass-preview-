import { matchNeedSchema, type MatchCandidate, type MatchNeed } from '@bellum/contracts'
import { axisSector } from './axes'

/**
 * « Le secteur doit être porté par la mission, pas par le compte » — le point
 * n°1 du retour bêta sur le matching (addendum Stelya §4.1, §14.1).
 */

function need(overrides: Partial<MatchNeed> = {}): MatchNeed {
  return matchNeedSchema.parse({
    needId: null,
    role: 'Automaticien',
    accountName: 'Groupe industriel',
    accountSector: 'Industrie manufacturière',
    skills: [],
    minYears: null,
    seniorityBand: null,
    environment: [],
    languages: [],
    clearances: [],
    location: null,
    remote: null,
    startOn: null,
    targetRateCents: null,
    contractKind: null,
    ...overrides,
  })
}

function candidate(sectors: string[]): MatchCandidate {
  return { sectors } as unknown as MatchCandidate
}

describe('axisSector — le secteur vient de la demande, pas du groupe', () => {
  it('le secteur du PROJET prime sur celui du compte', () => {
    const outcome = axisSector(need({ projectSectors: ['Nucléaire'] }), candidate(['Nucléaire']))
    expect(outcome.score).toBe(100)
    expect(outcome.detail).toContain('Nucléaire')
  })

  it('un profil du secteur du GROUPE ne passe pas pour autant', () => {
    // Le cœur du §14.1 : deux projets du même compte ne partagent pas leur
    // secteur. Un profil « industrie manufacturière » n'est pas un profil
    // nucléaire, et le compte ne doit pas le faire croire.
    const outcome = axisSector(need({ projectSectors: ['Nucléaire'] }), candidate(['Industrie manufacturière']))
    expect(outcome.score).toBe(0)
  })

  it('deux projets du même compte ne produisent pas le même classement', () => {
    const automaticien = candidate(['Automobile'])
    const auto = axisSector(need({ projectSectors: ['Automobile'] }), automaticien)
    const nucleaire = axisSector(need({ projectSectors: ['Nucléaire'] }), automaticien)
    expect(auto.score).toBe(100)
    expect(nucleaire.score).toBe(0)
  })

  it('sans secteur de projet, le repli sur le compte est NOMMÉ', () => {
    // Un repli tu se lit comme une donnée. L'explication doit dire d'où vient
    // le secteur employé, sinon personne ne peut la contredire.
    const outcome = axisSector(need({ projectSectors: [] }), candidate(['Industrie manufacturière']))
    expect(outcome.score).toBe(100)
    expect(outcome.detail).toContain('secteur du compte')
  })

  it('ni projet ni compte : non évaluable, jamais zéro', () => {
    const outcome = axisSector(need({ projectSectors: [], accountSector: null }), candidate(['Automobile']))
    expect(outcome.score).toBeNull()
  })

  it('un profil sans secteur déclaré sort du dénominateur', () => {
    expect(axisSector(need({ projectSectors: ['Nucléaire'] }), candidate([])).score).toBeNull()
  })

  it('un seul des secteurs du projet suffit — un projet peut en servir deux', () => {
    const outcome = axisSector(need({ projectSectors: ['Ferroviaire', 'Automobile'] }), candidate(['Automobile']))
    expect(outcome.score).toBe(100)
  })
})
