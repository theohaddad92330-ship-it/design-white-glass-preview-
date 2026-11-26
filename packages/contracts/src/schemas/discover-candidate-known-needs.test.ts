import { describe, expect, it } from 'vitest'
import { discoverCandidateSchema } from './discover.js'

/**
 * #3819.1 — « besoins connus (si le compte existe dans l'espace) » : un
 * candidat NEUF (`accountId: null`) n'a pas de besoins à connaître — le champ
 * reste absent, jamais `0` deviné. Un candidat DÉJÀ POSSÉDÉ porte un COMPTE
 * RÉEL (entier ≥ 0, mesuré par `DiscoverPortfolioService`) — `0` y est un
 * fait mesuré (« on a cherché, il n'y en a aucun »), pas une absence.
 */
describe('discoverCandidateSchema — knownNeedsCount (#3819.1)', () => {
  const base = {
    name: 'Capgemini',
    siren: '552081317',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: null,
    scoreFactors: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'analyzed' as const,
    accountId: 'acc-1',
    sources: [],
    signals: [],
  }

  it('accepte un compte mesuré, zéro inclus', () => {
    expect(discoverCandidateSchema.parse({ ...base, knownNeedsCount: 0 }).knownNeedsCount).toBe(0)
    expect(discoverCandidateSchema.parse({ ...base, knownNeedsCount: 3 }).knownNeedsCount).toBe(3)
  })

  it('reste absent sans le champ — un instantané d’avant ce déploiement, ou un candidat neuf', () => {
    expect(discoverCandidateSchema.parse(base).knownNeedsCount).toBeUndefined()
  })

  it('refuse un compte négatif — jamais un besoin retiré en comptant', () => {
    expect(discoverCandidateSchema.safeParse({ ...base, knownNeedsCount: -1 }).success).toBe(false)
  })
})
