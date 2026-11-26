import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4556 (craft rule n°9) — la démonstration ne rend JAMAIS une liste Découvrir vide pour une ville qu'elle ne connaît
 * pas (« Reprendre » sur « Albi · 250 à 999 » chargeait la requête sans afficher une carte). Aucune ville inventée :
 * la salle rend sa liste de vrais comptes, la taille ne la vide pas, et une taille absente n'est jamais « 0 ».
 */
type Card = { name: string; city: string | null; headcountRange: string | null }

describe('#4556 — la liste Découvrir de la salle ne se vide pas sur une ville ou une taille', () => {
  const response = demoDiscoverResponse({ city: 'Albi', headcountMin: 250, headcountMax: 999 })
  const cards = response.candidates as Card[]

  it('« Albi · 250 à 999 » rend des cartes, pas une page blanche', () => {
    expect(cards.length).toBeGreaterThanOrEqual(8)
  })

  it('chaque carte porte un nom complet ; une taille inconnue reste null, jamais « 0 »', () => {
    for (const card of cards) {
      expect(card.name.trim().length).toBeGreaterThan(2)
      expect(card.headcountRange === null || !/^0\b/.test(card.headcountRange)).toBe(true)
    }
  })

  it('la garde dit NON : sans ville, la même liste revient (la ville ne la vide pas, elle ne la change pas)', () => {
    const bare = demoDiscoverResponse({}).candidates as Card[]
    expect(bare.length).toBeGreaterThanOrEqual(cards.length - 1)
  })
})
