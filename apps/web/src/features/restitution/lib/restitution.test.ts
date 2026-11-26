import { describe, expect, it } from 'vitest'
import { hasRestitutionSignal, summaryPhraseCounts } from './restitution'

/**
 * #2080 — Restitution après connexion ou import.
 *
 * Le principe qui traverse tout ce fichier : ce panneau ne montre QUE des
 * nombres mesurés. « Non mesuré » n'est jamais rendu « 0 » (doctrine du
 * dépôt) — une fonction qui ne peut pas répondre rend `null`, jamais un
 * chiffre inventé pour remplir un trou.
 */
describe('#2080.2/.9 — hasRestitutionSignal', () => {
  it('est vrai dès qu’un compte a été créé ou mis à jour', () => {
    expect(hasRestitutionSignal({ created: 1, updated: 0 })).toBe(true)
    expect(hasRestitutionSignal({ created: 0, updated: 3 })).toBe(true)
  })

  it('est faux quand rien n’a bougé — le panneau ne s’affiche pas sur du vide', () => {
    expect(hasRestitutionSignal({ created: 0, updated: 0 })).toBe(false)
  })
})

describe('#2080.9 — la phrase mesurée (« 64 contacts, mais 37 sans prochaine action »)', () => {
  it('additionne créations et mises à jour en un seul total RETROUVÉ', () => {
    expect(summaryPhraseCounts({ created: 40, updated: 24 }, null)).toEqual({ total: 64, withoutNextAction: null })
  })

  it('porte le second chiffre SEULEMENT quand il est mesuré — jamais inventé', () => {
    expect(summaryPhraseCounts({ created: 64, updated: 0 }, 37)).toEqual({ total: 64, withoutNextAction: 37 })
  })
})
