import { describe, expect, it } from 'vitest'
import { hasOfferObjective } from './account-score.js'

/**
 * #3818.1 — `hasOfferObjective` est la seule lecture de « l'espace a-t-il
 * renseigné un domaine d'offre ? », reprise par les quatre écrans de fiche
 * compte (voir #3818) au lieu de chacun deviner.
 */
describe('hasOfferObjective (#3818.1)', () => {
  it('aucun profil (null/undefined) : pas d’objectif', () => {
    expect(hasOfferObjective(null)).toBe(false)
    expect(hasOfferObjective(undefined)).toBe(false)
  })

  it('profil sans offer_domain ni offer_domains : pas d’objectif', () => {
    expect(hasOfferObjective({})).toBe(false)
    expect(hasOfferObjective({ offer_domain: null, offer_domains: [] })).toBe(false)
  })

  it('offer_domain singulier renseigné : objectif présent', () => {
    expect(hasOfferObjective({ offer_domain: 'esn_it' })).toBe(true)
  })

  it('offer_domains (portefeuille) non vide : objectif présent même sans offer_domain', () => {
    expect(hasOfferObjective({ offer_domain: null, offer_domains: ['finance'] })).toBe(true)
  })
})
