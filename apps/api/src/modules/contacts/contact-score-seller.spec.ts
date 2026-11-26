import { computeContactScore } from '@bellum/contracts'
import { profileOfferTokens, sellerScoringContextFrom } from './contact-score-seller'

describe('lot 758 — l’offre de l’ESN, lue sur son profil', () => {
  it('rien de déclaré ⇒ aucun contexte : le score reste EXACTEMENT celui d’avant', () => {
    expect(sellerScoringContextFrom(null)).toBeUndefined()
    expect(sellerScoringContextFrom({ offers: ['  '], offerPortfolioNames: [] })).toBeUndefined()
    expect(profileOfferTokens(undefined).size).toBe(0)
  })

  it('les offres déclarées et le portefeuille deviennent les thèmes de l’offre', () => {
    expect(sellerScoringContextFrom({ offers: ['Data & IA'], offerPortfolioNames: ['Cloud'] })).toEqual({
      focusThemes: ['Data & IA', 'Cloud'],
    })
    expect([...profileOfferTokens({ offers: ['Data & IA'] })]).toContain('data')
  })

  it('pour une ESN data, un Head of Data passe devant un chef de l’architecture joignable', () => {
    const seller = sellerScoringContextFrom({ offers: ['Data & IA'] })
    const headOfData = { title: 'Head of Data', role: 'technical', source: 'apollo' }
    const architect = {
      title: "Directeur de l'architecture",
      role: 'technical',
      source: 'apollo',
      email: 'a@x.fr',
      emailVerified: true,
    }
    expect(computeContactScore(headOfData, seller)).toBeGreaterThan(computeContactScore(architect, seller))
  })
})
