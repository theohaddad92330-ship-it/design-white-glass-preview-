import { discoverResponseSchema, hiringScopeVerdict } from '@bellum/contracts'
import { DEMO_ESN_PROFILE } from './demo-dataset'
import { demoRealCompanySignals } from './demo-discover-real-companies'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #3901.p (Louis 16/10/2026, craft rule n°9) — Découvrir retire toute offre HORS des métiers de l'ESN. La démo
 * ne doit pas se vider pour autant : chaque offre semée sur une carte recoupe un métier placé du profil démo
 * (`placed_roles`) — « un écran livré mais vide en démo se découvre en réunion, pas en CI ».
 */
const profile = { placedRoles: DEMO_ESN_PROFILE.placed_roles, noGoSectors: [] }

describe('#3901.p — les offres semées de Découvrir sont toutes dans les métiers du profil démo', () => {
  it('les cartes scriptées', () => {
    const response = discoverResponseSchema.parse(demoDiscoverResponse({}))
    const offers = response.candidates.flatMap(card =>
      card.signals.filter(signal => signal.type === 'hiring').map(signal => signal.label),
    )
    expect(offers.length).toBeGreaterThan(0)
    // #4284.1 (recette 21/10, craft rule n°9) — UNE offre hors métier est semée À DESSEIN : « Gérant de magasin »,
    // sur un compte marqué `outOfTrade`. Toutes les autres restent dans les métiers du profil démo.
    expect(offers.filter(label => !hiringScopeVerdict(label, profile).keep)).toEqual(['Gérant de magasin H/F'])
  })

  it('#4284.26 — le compte hors métier semé porte la marque `outOfTrade`, et lui seul', () => {
    const response = discoverResponseSchema.parse(demoDiscoverResponse({}))
    const marked = response.candidates.filter(card => card.outOfTrade === true).map(card => card.name)
    expect(marked).toEqual(['Maison Delcourt Proximité (démo)'])
  })

  it('les entreprises réelles semées', () => {
    for (let rank = 0; rank < 12; rank += 1) {
      for (const signal of demoRealCompanySignals(rank)) {
        expect({ label: signal.label, keep: hiringScopeVerdict(signal.label, profile).keep }).toEqual({
          label: signal.label,
          keep: true,
        })
      }
    }
  })
})
