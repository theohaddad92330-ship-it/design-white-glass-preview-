import { orgGraphSchema, readOrgFreshness } from '@bellum/contracts'
import { sncfOrgGraph } from './demo-org-graphs'
import { seatName } from './demo-seat-names'

/**
 * #3434 (recette prod 30/09) — « la mention de date périmée n'a pas pu être
 * déclenchée (à rejouer sur un organigramme ancien) ». La démonstration doit
 * porter UN organigramme ancien, sinon l'écran livré est vide en réunion
 * (craft rule 9).
 */
describe('démo — organigramme ancien (#3434)', () => {
  const now = new Date('2026-09-30T12:00:00Z')
  const graph = orgGraphSchema.parse(sncfOrgGraph)
  // Décision Louis 01/11/2026 : le siège porte un nom fictif (`demo-seat-names.ts`), plus son intitulé.
  const STALE = seatName('Directeur du numérique du groupe')

  it('au moins une personne est PÉRIMÉE, avec sa date', () => {
    const stale = graph.people.filter(p => readOrgFreshness(p.lastVerifiedAt, now).state === 'stale')
    expect(stale.map(p => p.fullName)).toContain(STALE)
  })

  it('les autres restent « jamais vérifié » : aucune date inventée', () => {
    const others = graph.people.filter(p => p.fullName !== STALE)
    expect(others.every(p => p.lastVerifiedAt == null)).toBe(true)
  })
})
