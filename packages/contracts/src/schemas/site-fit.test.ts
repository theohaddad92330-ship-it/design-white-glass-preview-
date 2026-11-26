import { describe, expect, it } from 'vitest'
import { offerPortfolioSchema } from './offer-portfolio.js'
import { siteSchema, type Site } from './account-entity.js'
import { siteFit } from './site-fit.js'

function site(overrides: Partial<Site> = {}): Site {
  return siteSchema.parse({
    id: '00000000-0000-4000-8000-000000000001',
    account_id: '00000000-0000-4000-8000-000000000002',
    entity_id: null,
    label: 'Usine de Bressols',
    city: 'Bressols',
    postal_code: null,
    country: 'FR',
    siret: null,
    headcount: null,
    created_at: '2026-08-24T00:00:00.000Z',
    updated_at: '2026-08-24T00:00:00.000Z',
    ...overrides,
  })
}

const POLICY = offerPortfolioSchema.parse({ target_site: { types: ['usine'], min_headcount: 100 } })

describe('siteFit — une préférence, pas une règle', () => {
  it('sans politique déclarée, il n’y a rien à trancher', () => {
    expect(siteFit(site(), null).verdict).toBe('unknown')
    expect(siteFit(site(), offerPortfolioSchema.parse({})).verdict).toBe('unknown')
  })

  it('un site du bon type et au-dessus du seuil correspond', () => {
    const fit = siteFit(site({ site_type: 'usine', headcount: 320, headcount_confidence: 'high' }), POLICY)
    expect(fit.verdict).toBe('fits')
    expect(fit.reason).toContain('320')
  })

  it('sous le seuil, c’est « below » et jamais « exclu » — un signal fort peut rattraper', () => {
    // « Le seuil de 100 est une préférence Stelya, pas une règle universelle du
    // produit » : un site de 80 qui porte un programme CAPEX reste une cible.
    const fit = siteFit(site({ site_type: 'usine', headcount: 80, headcount_confidence: 'high' }), POLICY)
    expect(fit.verdict).toBe('below')
    expect(fit.reason).toContain('signal fort')
  })

  it('un effectif ABSENT n’est pas un petit effectif', () => {
    // Le piège que la règle évite : écarter un site non qualifié revient à
    // écarter tous ceux qui viennent d'arriver.
    const fit = siteFit(site({ site_type: 'usine', headcount: null }), POLICY)
    expect(fit.verdict).toBe('unknown')
    expect(fit.reason).toContain('à vérifier')
  })

  it('un effectif sans SOURCE ne tranche rien', () => {
    // Décider d'aller sur un site en se fondant sur un chiffre dont personne ne
    // dit d'où il vient est exactement ce que le §8.1 interdit.
    const fit = siteFit(site({ site_type: 'usine', headcount: 320, headcount_confidence: null }), POLICY)
    expect(fit.verdict).toBe('unknown')
    expect(fit.reason).toContain('sans source')
  })

  it('un type ABSENT ne vaut pas un mauvais type', () => {
    expect(siteFit(site({ site_type: null, headcount: 320 }), POLICY).verdict).toBe('unknown')
  })

  it('un type hors cible est catégorique, quel que soit l’effectif', () => {
    // Un entrepôt reste un entrepôt, même avec mille personnes dedans.
    const fit = siteFit(site({ site_type: 'entrepôt', headcount: 1000, headcount_confidence: 'high' }), POLICY)
    expect(fit.verdict).toBe('below')
    expect(fit.reason).toContain('entrepôt')
  })
})
