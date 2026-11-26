import { describe, expect, it } from 'vitest'
import { discoverCandidateSchema } from './discover.js'

/**
 * #2291.2 (19/09/2026) — le MODÈLE DE CONTRAT OBSERVÉ d'une entreprise cible
 * (DÉCISION Louis, QCM : l'observer). Trois états, jamais confondus :
 * clé absente = jamais cherché ; `null` = cherché, non observé ; objet = une
 * observation qui porte sa source, sa fenêtre, son jour de constat et son
 * volume. Un schéma qui accepterait une observation sans source ou sans volume
 * laisserait passer une préférence déduite.
 */
describe('discoverCandidateSchema — contractModel (#2291.2)', () => {
  const base = {
    name: 'Verdal Distribution',
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
    portfolioState: 'new' as const,
    accountId: null,
    sources: [],
    signals: [],
  }
  const observation = {
    observedAt: '2026-09-19',
    jobOffers: {
      source: 'France Travail',
      total: 14,
      counts: { permanent: 9, fixedTerm: 2, interim: 0, freelance: 3, other: 0 },
      since: '2026-06-20',
      until: '2026-09-12',
    },
    publicContracts: null,
  }

  it('garde une observation intacte — rien n’est retiré en route', () => {
    expect(discoverCandidateSchema.parse({ ...base, contractModel: observation }).contractModel).toEqual(observation)
  })

  it('accepte les avis de marchés publics seuls', () => {
    const contracts = {
      observedAt: '2026-09-19',
      jobOffers: null,
      publicContracts: { source: 'BOAMP', total: 3, regie: 2, fixedPrice: 1, since: '2026-02-01', until: '2026-09-01' },
    }
    expect(discoverCandidateSchema.parse({ ...base, contractModel: contracts }).contractModel).toEqual(contracts)
  })

  it('null = cherché, non observé ; absent reste absent', () => {
    expect(discoverCandidateSchema.parse({ ...base, contractModel: null }).contractModel).toBeNull()
    expect(discoverCandidateSchema.parse(base).contractModel).toBeUndefined()
  })

  it('refuse une observation sans source, sans volume ou au compte négatif', () => {
    const { source: _source, ...withoutSource } = observation.jobOffers
    expect(
      discoverCandidateSchema.safeParse({ ...base, contractModel: { ...observation, jobOffers: withoutSource } })
        .success,
    ).toBe(false)
    expect(
      discoverCandidateSchema.safeParse({
        ...base,
        contractModel: { ...observation, jobOffers: { ...observation.jobOffers, total: 0 } },
      }).success,
    ).toBe(false)
    expect(
      discoverCandidateSchema.safeParse({
        ...base,
        contractModel: {
          ...observation,
          jobOffers: { ...observation.jobOffers, counts: { ...observation.jobOffers.counts, freelance: -1 } },
        },
      }).success,
    ).toBe(false)
  })
})
