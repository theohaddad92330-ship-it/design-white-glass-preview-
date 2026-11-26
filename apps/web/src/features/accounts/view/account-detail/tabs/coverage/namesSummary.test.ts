import { namesSummary } from './namesSummary'

const rest = (count: number) => `+ ${count} autres`

describe('namesSummary', () => {
  it('rend la liste entière quand elle est courte', () => {
    expect(namesSummary(['A', 'B'], rest)).toBe('A, B')
  })

  it('borne l’énumération et COMPTE le reste', () => {
    // « et 36 autres » se lit ; « … » ne se lit pas. C'est la différence entre
    // un indicateur et un pavé de quarante noms.
    const names = Array.from({ length: 40 }, (_, i) => `E${i}`)
    expect(namesSummary(names, rest)).toBe('E0, E1, E2, E3 + 36 autres')
  })

  it('conserve l’ordre reçu', () => {
    // La source trie du mieux couvert au moins couvert : re-trier ici mettrait
    // en avant autre chose que ce que l'appelant a choisi.
    expect(namesSummary(['Zeta', 'Alpha'], rest)).toBe('Zeta, Alpha')
  })

  it('ignore les entrées vides plutôt que d’afficher des virgules seules', () => {
    expect(namesSummary(['A', '  ', '', 'B'], rest)).toBe('A, B')
  })

  it('rend une chaîne vide quand il n’y a rien à nommer', () => {
    // L'appelant doit pouvoir distinguer « rien à dire » de « une liste vide
    // formatée » — sinon l'indicateur affiche une ligne d'aide vide.
    expect(namesSummary([], rest)).toBe('')
    expect(namesSummary(['   '], rest)).toBe('')
  })
})
