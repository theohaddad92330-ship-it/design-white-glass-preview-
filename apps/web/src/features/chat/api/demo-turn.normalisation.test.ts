import { describe, expect, it } from 'vitest'
import { demoTurn } from './demo-turn'

/**
 * #3398.4b (recette salle démo 03/10) — « la question EXACTE rend "réponses
 * préparées à l'avance" ». Le script écrit l'apostrophe typographique (’) ; un
 * clavier, un collage ou un outil de recette envoie l'apostrophe droite ('), une
 * espace insécable avant « ? », parfois sans accents : la correspondance exacte
 * échouait sur un caractère invisible. Normalisation (accents, apostrophes,
 * casse, espaces) — JAMAIS d'approximation : une autre question reste sans réponse.
 */
describe('#3398.4b — la question en retard se reconnaît malgré apostrophe, accents et casse', () => {
  const VARIANTS = [
    'Qu’est-ce qui est en retard sur mes comptes ?',
    "Qu'est-ce qui est en retard sur mes comptes ?",
    'Qu’est-ce qui est en retard sur mes comptes ?',
    "QU'EST-CE QUI EST EN RETARD SUR MES COMPTES",
    'Qu`est-ce qui est en retard sur mes comptes?',
    'Qu’est-ce qui est en rétard sur mes comptes ?',
  ]
  for (const question of VARIANTS) {
    it(`reconnaît ${JSON.stringify(question)}`, () => {
      const turn = demoTurn(question, 'fallback')
      expect(turn.reply).not.toBe('fallback')
      expect(turn.reply).toMatch(/Société Générale/)
      expect(turn.reply).toMatch(/deux profils conformité/)
    })
  }

  it('une question VOISINE ne déclenche pas cette réponse (jamais approximatif)', () => {
    expect(demoTurn('Qu’est-ce qui est en retard sur mes factures ?', 'fallback').reply).toBe('fallback')
    expect(demoTurn('Qu’est-ce qui est en retard ?', 'fallback').reply).toBe('fallback')
  })
})
