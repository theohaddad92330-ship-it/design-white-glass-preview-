import { describe, expect, it } from 'vitest'
import { detectMultiOwnerOpportunities, type OpportunityOwnersCandidate } from './opportunity-multi-owner.js'

/**
 * #2325.32 — « plusieurs owners » sur UNE affaire (le propriétaire de l'affaire
 * ET les tâches ouvertes qui s'y rattachent peuvent diverger). Distinct de
 * #2325.34/.35 : ici, c'est UNE affaire qui a plusieurs porteurs — pas une
 * ressource partagée entre plusieurs affaires.
 */
function candidate(over: Partial<OpportunityOwnersCandidate> = {}): OpportunityOwnersCandidate {
  return { id: 'opp-1', ownerIds: ['user-1'], ...over }
}

describe('detectMultiOwnerOpportunities — #2325.32', () => {
  it('une affaire avec deux porteurs distincts remonte', () => {
    const result = detectMultiOwnerOpportunities([candidate({ ownerIds: ['user-1', 'user-2'] })])
    expect(result).toEqual([{ opportunityId: 'opp-1', ownerIds: ['user-1', 'user-2'] }])
  })

  it('un seul porteur, même répété plusieurs fois, ne remonte rien', () => {
    const result = detectMultiOwnerOpportunities([candidate({ ownerIds: ['user-1', 'user-1', 'user-1'] })])
    expect(result).toEqual([])
  })

  it('aucun porteur connu ne remonte rien — jamais un owner deviné', () => {
    expect(detectMultiOwnerOpportunities([candidate({ ownerIds: [] })])).toEqual([])
  })

  it('déduplique les porteurs — l’ordre d’apparition est stable, jamais un tri par nom', () => {
    const result = detectMultiOwnerOpportunities([candidate({ ownerIds: ['user-2', 'user-1', 'user-2', 'user-1'] })])
    expect(result).toEqual([{ opportunityId: 'opp-1', ownerIds: ['user-2', 'user-1'] }])
  })

  it('une liste vide ne produit rien — jamais une réponse inventée', () => {
    expect(detectMultiOwnerOpportunities([])).toEqual([])
  })
})
