import { describe, expect, it } from 'vitest'
import { discoverResponseSchema } from './discover.js'

// #4430 / #4437 (Louis 21/10/2026) — la date des offres lues en cache, le remplissage frais d'une recherche
// par compétence et l'étiquette d'un compte VOISIN voyagent de l'IA jusqu'à l'écran (zod retirerait une clé
// inconnue, et l'écran ne pourrait plus dire POURQUOI un compte est là ni DE QUAND sont ses offres).
const card = {
  name: 'ALPHA',
  siren: '800000001',
  nafCode: null,
  sector: null,
  city: 'LYON',
  department: '69',
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
}

describe('#4430 / #4437 — offres fraîches et faits voisins dans le contrat Découvrir', () => {
  it('garde la date des offres, le remplissage frais et l’étiquette du voisin', () => {
    const parsed = discoverResponseSchema.parse({
      candidates: [
        { ...card, jobsAsOf: '2026-10-19', skillFreshFill: true },
        { ...card, siren: '800000003', widenedFrom: { axis: 'signal', requested: ['hiring:react'], via: 'tender' } },
      ],
      query: {},
      degraded: [],
      widening: { requested: ['hiring:react'], added: 1, via: ['hiring', 'capital'] },
    })
    expect(parsed.candidates[0]?.jobsAsOf).toBe('2026-10-19')
    expect(parsed.candidates[0]?.skillFreshFill).toBe(true)
    expect(parsed.candidates[1]?.widenedFrom?.via).toBe('tender')
    expect(parsed.widening?.added).toBe(1)
  })

  it('refuse une date d’offres qui n’est pas une date, et un axe d’élargissement inconnu', () => {
    expect(() =>
      discoverResponseSchema.parse({ candidates: [{ ...card, jobsAsOf: 'hier' }], query: {}, degraded: [] }),
    ).toThrow()
    expect(() =>
      discoverResponseSchema.parse({
        candidates: [{ ...card, widenedFrom: { axis: 'humeur', requested: [], via: 'x' } }],
        query: {},
        degraded: [],
      }),
    ).toThrow()
  })
})
