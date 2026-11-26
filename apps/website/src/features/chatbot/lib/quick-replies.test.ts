import { describe, expect, it } from 'vitest'
import { MAX_QUICK_REPLIES, quickRepliesFor } from './quick-replies'
import { SCORING_AXES } from './routing'

describe('les réponses rapides', () => {
  it('en propose au plus trois, sur chaque axe et à la conclusion', () => {
    for (const axis of SCORING_AXES) {
      expect(quickRepliesFor(axis).length).toBeGreaterThan(0)
      expect(quickRepliesFor(axis).length).toBeLessThanOrEqual(MAX_QUICK_REPLIES)
    }
    expect(quickRepliesFor(null).length).toBeLessThanOrEqual(MAX_QUICK_REPLIES)
  })

  it('change à chaque tour — elles suivent l’axe cherché', () => {
    expect(quickRepliesFor('companyType')).not.toEqual(quickRepliesFor('tooling'))
  })

  it('ne rend que des CLÉS, jamais des phrases', () => {
    // Une phrase française renvoyée par l'API finit sous les yeux d'un
    // visiteur néerlandais — c'est déjà la règle du CTA et des erreurs.
    for (const axis of [...SCORING_AXES, null]) {
      for (const key of quickRepliesFor(axis)) {
        expect(key).toMatch(/^[a-zA-Z]+\.[a-zA-Z]+$/)
        expect(key).not.toContain(' ')
      }
    }
  })

  it('propose des GESTES quand il n’y a plus rien à demander', () => {
    expect(quickRepliesFor(null)).toEqual(['closing.seeDemo', 'closing.talkToTeam', 'closing.pricing'])
  })

  it('couvre les huit axes — un axe sans réponse rapide laisserait un tour nu', () => {
    for (const axis of SCORING_AXES) expect(quickRepliesFor(axis)[0]).toContain(`${axis}.`)
  })
})
