import { describe, expect, it } from 'vitest'
import { networkCountsOf } from './networkCounts'

const TALLY = { withEmail: 12, withPhone: 7, unattached: 3, monCrm: 5 }

// #4527.1/.3/.6 — les chiffres des tuiles viennent du SERVEUR ; jamais un compte des pages chargées.
describe('networkCountsOf', () => {
  it('#4527.6 : les chiffres sont présents même quand il reste des pages à charger', () => {
    expect(networkCountsOf({ tally: TALLY, narrowedClientSide: false })).toEqual({
      withEmail: 12,
      withPhone: 7,
      unattached: 3,
    })
  })

  it('#4527.3 sait dire NON : chargement ou échec (tally absent) ⇒ AUCUN chiffre, jamais 0', () => {
    expect(networkCountsOf({ tally: undefined, narrowedClientSide: false })).toEqual({
      withEmail: undefined,
      withPhone: undefined,
      unattached: undefined,
    })
  })

  it('une vue qui rogne les lignes côté client (À enrichir, Ne pas solliciter…) ⇒ aucun chiffre plutôt qu’un faux', () => {
    expect(networkCountsOf({ tally: TALLY, narrowedClientSide: true })).toEqual({
      withEmail: undefined,
      withPhone: undefined,
      unattached: undefined,
    })
  })
})
