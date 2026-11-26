import { describe, expect, it } from 'vitest'
import { parseGuideBodySegments } from './guide-body-markup'

/**
 * #2214.16 (tranché sans Louis) — voir le docblock de `guide-body-markup.ts`.
 */
describe('parseGuideBodySegments', () => {
  it('rend le texte tel quel quand rien n’est marqué — le cas de TOUS les guides actuels', () => {
    const segments = parseGuideBodySegments(
      "Tape son nom et, si tu veux, ton intention. Plus le contexte est précis, plus le dossier l'est.",
    )
    expect(segments).toEqual([
      {
        text: "Tape son nom et, si tu veux, ton intention. Plus le contexte est précis, plus le dossier l'est.",
        emphasis: false,
      },
    ])
  })

  it('isole le groupe marqué **ainsi**, sans les astérisques', () => {
    const segments = parseGuideBodySegments(
      'Ce qui est connu s’affiche ici ; **ce qui n’a pas pu être trouvé** est dit, jamais inventé.',
    )
    expect(segments).toEqual([
      { text: 'Ce qui est connu s’affiche ici ; ', emphasis: false },
      { text: 'ce qui n’a pas pu être trouvé', emphasis: true },
      { text: ' est dit, jamais inventé.', emphasis: false },
    ])
  })

  it('accepte plusieurs groupes marqués dans la même bulle', () => {
    const segments = parseGuideBodySegments('**Rien** n’est envoyé sans **ton clic**.')
    expect(segments).toEqual([
      { text: 'Rien', emphasis: true },
      { text: ' n’est envoyé sans ', emphasis: false },
      { text: 'ton clic', emphasis: true },
      { text: '.', emphasis: false },
    ])
  })

  it('sait dire NON à un paragraphe entier marqué — ce n’est plus « les mots qui comptent »', () => {
    const wholeParagraph = '**Ce bouton prépare l’analyse. Rien n’est lancé ni débité tant que tu n’as pas confirmé.**'
    const segments = parseGuideBodySegments(wholeParagraph)
    // La fonction ne REFUSE pas la syntaxe (elle ne connaît pas la règle
    // éditoriale) — mais elle prouve qu'un paragraphe entier marqué produit
    // UN SEUL segment en emphase, jamais plusieurs, ce qui est exactement ce
    // qu'une revue de contenu peut repérer d'un coup d'œil sur le texte i18n.
    expect(segments).toEqual([
      {
        text: 'Ce bouton prépare l’analyse. Rien n’est lancé ni débité tant que tu n’as pas confirmé.',
        emphasis: true,
      },
    ])
  })
})
