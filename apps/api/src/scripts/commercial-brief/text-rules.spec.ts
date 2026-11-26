import { neutralizeOneSide } from './text-rules'

/** Démo clients 04/10/2026 : les ESN prospects (QuickSort, Meedz, Alpineo) sont neutralisées comme « OneSide ». */
describe('neutralizeOneSide — noms des ESN prospects', () => {
  it.each([
    ['Le cœur de cible de QuickSort, prouvé et bien payé.', 'Le cœur de ta cible, prouvé et bien payé.'],
    ['Hors cœur QuickSort.', 'Hors de ton cœur.'],
    ['Le cœur de QuickSort au moment exact où le compte bascule.', 'Ton cœur au moment exact où le compte bascule.'],
    [
      'la pression tarifaire dont parle Meedz est structurelle',
      'la pression tarifaire dont tu parles est structurelle',
    ],
    ['C’est exactement le durcissement que vit Meedz. Il faut', 'C’est exactement le durcissement que tu vis. Il faut'],
    ["C'est exactement le durcissement que vit Meedz.", "C'est exactement le durcissement que tu vis."],
    ["Cœur de l'offre Meedz.", 'Cœur de ton offre.'],
  ])('réécrit « %s »', (input, expected) => {
    expect(neutralizeOneSide(input)).toBe(expected)
  })

  it('échoue sur une mention non prévue (ajouter une règle, jamais une substitution aveugle)', () => {
    expect(() => neutralizeOneSide('Un contrat avec Meedz.')).toThrow(/non neutralisé/)
    expect(() => neutralizeOneSide('Offre Alpineo 2026')).toThrow(/non neutralisé/)
    expect(() => neutralizeOneSide('Du QuickSort partout')).toThrow(/non neutralisé/)
  })

  it('ne touche jamais une adresse e-mail (coordonnée en clair, jamais modifiée)', () => {
    const text = 'yanis.sadi@adeo.com | yanis.sadi@meedz.io'
    expect(neutralizeOneSide(text)).toBe(text)
  })
})
