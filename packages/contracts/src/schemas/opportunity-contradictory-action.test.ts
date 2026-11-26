import { describe, expect, it } from 'vitest'
import {
  detectContradictoryActions,
  type OpportunityActionContradictionCandidate,
} from './opportunity-contradictory-action.js'

/**
 * #2325.36 — « actions contradictoires », bornée à la SEULE contradiction
 * mesurable sans rien deviner (voir le docblock de l'implémentation) : une
 * issue CONNUE (gagnée/perdue) qui porte encore une tâche ouverte.
 */
function opportunity(
  over: Partial<OpportunityActionContradictionCandidate> = {},
): OpportunityActionContradictionCandidate {
  return { id: 'opp-1', stage: 'won', hasOpenTask: true, ...over }
}

describe('detectContradictoryActions — #2325.36', () => {
  it('une affaire GAGNÉE avec une tâche encore ouverte est contradictoire', () => {
    const result = detectContradictoryActions([opportunity({ stage: 'won', hasOpenTask: true })])
    expect(result).toEqual([{ opportunityId: 'opp-1', stage: 'won' }])
  })

  it('une affaire PERDUE avec une tâche encore ouverte est contradictoire', () => {
    const result = detectContradictoryActions([opportunity({ stage: 'lost', hasOpenTask: true })])
    expect(result).toEqual([{ opportunityId: 'opp-1', stage: 'lost' }])
  })

  it('une affaire gagnée SANS tâche ouverte n’est pas contradictoire', () => {
    expect(detectContradictoryActions([opportunity({ stage: 'won', hasOpenTask: false })])).toEqual([])
  })

  it('une affaire EN COURS (issue non connue) avec une tâche ouverte n’est pas contradictoire — c’est le cours normal', () => {
    expect(detectContradictoryActions([opportunity({ stage: 'qualified', hasOpenTask: true })])).toEqual([])
  })

  it('une affaire ENDORMIE (dormant) avec une tâche ouverte est HORS champ — pas d’issue annoncée', () => {
    expect(detectContradictoryActions([opportunity({ stage: 'dormant', hasOpenTask: true })])).toEqual([])
  })

  it('une liste vide ne produit rien — jamais une réponse inventée', () => {
    expect(detectContradictoryActions([])).toEqual([])
  })
})
