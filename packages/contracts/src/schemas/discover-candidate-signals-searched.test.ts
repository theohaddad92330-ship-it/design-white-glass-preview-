import { describe, expect, it } from 'vitest'
import { discoverCandidateSchema } from './discover.js'

/**
 * Décision 1 (18/09/2026) — `signalsSearched` distingue « recherché, rien
 * trouvé » de « non ciblé par la recherche de signaux » (coût borné : seules
 * les premières lignes rendues sont interrogées). Un `signals` vide sans ce
 * champ ne doit JAMAIS se lire comme « aucun signal » — GA-18/19.
 */
describe('discoverCandidateSchema — signalsSearched (décision 1, 18/09/2026)', () => {
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

  it('accepte signalsSearched: true', () => {
    expect(discoverCandidateSchema.parse({ ...base, signalsSearched: true }).signalsSearched).toBe(true)
  })

  it('accepte signalsSearched: false', () => {
    expect(discoverCandidateSchema.parse({ ...base, signalsSearched: false }).signalsSearched).toBe(false)
  })

  it('absent reste absent — un instantané d’avant ce lot ne le porte pas', () => {
    expect(discoverCandidateSchema.parse(base).signalsSearched).toBeUndefined()
  })
})
