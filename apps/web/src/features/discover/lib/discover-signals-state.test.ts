import { describe, expect, it } from 'vitest'

import { splitDegraded } from './discover-coverage'
import { normalizeDiscoverResponse } from './discover-normalize'

/**
 * #4677 L7 — « résultats partiels » décrit l'état COURANT. Une moisson de signaux encore en cours n'est
 * pas une panne (la ligne le dit) ; une liste qui a atteint son volume n'est pas « partielle ».
 */
describe('signaux en arrière-plan — le bandeau « résultats partiels »', () => {
  const signalsLate = { source: 'discover-signals', reason: 'time_budget', count: 12 }
  const registryDown = { source: 'pappers', reason: 'upstream_error' }

  it('une moisson de signaux en cours n’est PAS une panne de la liste', () => {
    expect(splitDegraded([signalsLate]).faults).toEqual([])
  })

  it('une vraie panne reste dite, même avec une moisson en cours (la garde sait dire NON)', () => {
    expect(splitDegraded([signalsLate, registryDown]).faults).toEqual([registryDown])
  })

  it('une moisson en panne RÉELLE (pas un délai) reste une panne', () => {
    const broken = { source: 'discover-signals', reason: 'network_error' }
    expect(splitDegraded([broken]).faults).toEqual([broken])
  })

  it('« volume demandé atteint » et « résultats partiels » ne s’affichent JAMAIS ensemble', () => {
    const slowList = { source: 'recherche-entreprises', reason: 'time_budget' }
    expect(splitDegraded([slowList, registryDown], { volumeReached: true }).faults).toEqual([registryDown])
    // Volume non atteint : le délai de la liste reste dit.
    expect(splitDegraded([slowList]).faults).toEqual([slowList])
  })

  it('le bandeau disparaît quand la moisson a fini (plus d’entrée discover-signals)', () => {
    expect(splitDegraded([]).faults).toEqual([])
  })
})

describe('signaux en arrière-plan — l’état d’une carte', () => {
  const row = (over: Record<string, unknown>) => ({
    name: 'ACME',
    siren: '552100554',
    signals: [],
    ...over,
  })
  const stateOf = (over: Record<string, unknown>) =>
    normalizeDiscoverResponse({ candidates: [row(over)], query: {}, degraded: [] }).candidates[0]?.signalsState

  it('en cours, aucun, source indisponible : trois états distincts, rien d’inventé', () => {
    expect(stateOf({ signalsState: 'pending' })).toBe('pending')
    expect(stateOf({ signalsState: 'none' })).toBe('none')
    expect(stateOf({ signalsState: 'unavailable' })).toBe('unavailable')
    expect(stateOf({})).toBeUndefined()
    expect(stateOf({ signalsState: 'whatever' })).toBeUndefined()
  })
})
