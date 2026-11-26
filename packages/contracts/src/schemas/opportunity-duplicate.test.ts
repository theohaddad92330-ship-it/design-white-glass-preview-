import { describe, expect, it } from 'vitest'
import { detectDuplicateOpportunities, type DuplicateOpportunityCandidate } from './opportunity-duplicate.js'

/**
 * #2325.33 — « détecte les doublons [d'affaires] ». Même geste que
 * {@link detectStaffingCollisions}/{@link detectContactSolicitationCollisions} :
 * un calcul pur, EXACT (jamais une ressemblance devinée), qui NOMME des
 * candidats — il ne fusionne rien (« on PROPOSE, on ne fusionne JAMAIS »).
 */
function opportunity(over: Partial<DuplicateOpportunityCandidate> = {}): DuplicateOpportunityCandidate {
  return {
    id: 'opp-1',
    accountId: 'acc-1',
    label: 'Socle data',
    stage: 'qualified',
    ...over,
  }
}

describe('detectDuplicateOpportunities — #2325.33', () => {
  it('deux affaires du MÊME compte avec le MÊME titre remontent en doublon', () => {
    const groups = detectDuplicateOpportunities([opportunity({ id: 'opp-1' }), opportunity({ id: 'opp-2' })])
    expect(groups).toEqual([{ accountId: 'acc-1', label: 'Socle data', opportunityIds: ['opp-1', 'opp-2'] }])
  })

  it('la casse et les espaces ne rachètent pas un vrai doublon — EXACT après normalisation, jamais une ressemblance', () => {
    const groups = detectDuplicateOpportunities([
      opportunity({ id: 'opp-1', label: 'Socle   data' }),
      opportunity({ id: 'opp-2', label: '  SOCLE DATA' }),
    ])
    expect(groups).toEqual([{ accountId: 'acc-1', label: 'Socle   data', opportunityIds: ['opp-1', 'opp-2'] }])
  })

  it('le MÊME titre sur DEUX comptes différents ne rapproche rien — deux homonymes ne fusionnent pas', () => {
    const groups = detectDuplicateOpportunities([
      opportunity({ id: 'opp-1', accountId: 'acc-1' }),
      opportunity({ id: 'opp-2', accountId: 'acc-2' }),
    ])
    expect(groups).toEqual([])
  })

  it('deux titres VIDES ne sont pas un doublon — une absence ne se compare pas à une absence', () => {
    const groups = detectDuplicateOpportunities([
      opportunity({ id: 'opp-1', label: '' }),
      opportunity({ id: 'opp-2', label: '   ' }),
    ])
    expect(groups).toEqual([])
  })

  it('une affaire gagnée/perdue/endormie hors périmètre : un doublon clos n’est plus un conflit de travail', () => {
    for (const stage of ['won', 'lost', 'dormant', 'detected', 'potential']) {
      const groups = detectDuplicateOpportunities([
        opportunity({ id: 'opp-1', stage }),
        opportunity({ id: 'opp-2', stage }),
      ])
      expect(groups).toEqual([])
    }
  })

  it('une liste vide ou sans doublon ne produit rien — jamais une réponse inventée', () => {
    expect(detectDuplicateOpportunities([])).toEqual([])
    expect(detectDuplicateOpportunities([opportunity({ id: 'opp-1' })])).toEqual([])
  })
})
