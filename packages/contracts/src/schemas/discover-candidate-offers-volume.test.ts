import { describe, expect, it } from 'vitest'
import { discoverCandidateSchema } from './discover.js'

/**
 * DISCOVER-OFFRES (15/10) — « N offres en France sur 90 jours » : un fait MESURÉ ou rien.
 * `count` est strictement positif : « 0 offre » n'est jamais écrit (une absence ne fait aucune ligne).
 */
describe('discoverCandidateSchema — offersVolume (DISCOVER-OFFRES)', () => {
  const base = {
    name: 'Lectra',
    siren: '300 000 009'.replace(/ /g, ''),
    nafCode: '62.01Z',
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: null,
    scoreFactors: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new' as const,
    accountId: null,
    sources: [],
    signals: [],
  }

  it('porte le volume quand il est mesuré', () => {
    const parsed = discoverCandidateSchema.parse({
      ...base,
      offersVolume: { count: 179, windowDays: 90, country: 'FR' },
    })
    expect(parsed.offersVolume).toEqual({ count: 179, windowDays: 90, country: 'FR' })
  })

  it("reste absent sans réponse — un instantané d'avant ce déploiement passe", () => {
    expect(discoverCandidateSchema.parse(base).offersVolume).toBeUndefined()
  })

  it('refuse un volume nul ou négatif — jamais « 0 offre »', () => {
    expect(
      discoverCandidateSchema.safeParse({ ...base, offersVolume: { count: 0, windowDays: 90, country: 'FR' } }).success,
    ).toBe(false)
    expect(
      discoverCandidateSchema.safeParse({ ...base, offersVolume: { count: -3, windowDays: 90, country: 'FR' } })
        .success,
    ).toBe(false)
  })
})
