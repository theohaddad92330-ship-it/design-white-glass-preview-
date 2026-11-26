import { describe, expect, it } from 'vitest'
import { effortConsistentWithFaults, normalizeSearchEffort } from './discover-search-effort'

describe('normalizeSearchEffort — #4305.2 l’effort d’une recherche, lu tel que le moteur le rend', () => {
  it('lit le nombre de sources interrogées et ce qui a arrêté la recherche', () => {
    expect(normalizeSearchEffort({ searchEffort: { sourcesQueried: 4, stoppedBy: 'limit' } })).toEqual({
      sourcesQueried: 4,
      stoppedBy: 'limit',
    })
  })
  it('une cause inconnue ne se devine pas : la ligne garde le nombre, sans cause', () => {
    expect(normalizeSearchEffort({ searchEffort: { sourcesQueried: 2, stoppedBy: 'banane' } })).toEqual({
      sourcesQueried: 2,
    })
  })
  it('absent, illisible ou à zéro : aucune ligne — jamais « 0 source »', () => {
    expect(normalizeSearchEffort(undefined)).toBeUndefined()
    expect(normalizeSearchEffort({})).toBeUndefined()
    expect(normalizeSearchEffort({ searchEffort: { sourcesQueried: 0, stoppedBy: 'limit' } })).toBeUndefined()
    expect(normalizeSearchEffort({ searchEffort: { sourcesQueried: 'quatre' } })).toBeUndefined()
  })
})

// #4627 — « Résultats partiels » ET « volume demandé atteint » ne peuvent pas être vrais ensemble.
describe('effortConsistentWithFaults — #4627', () => {
  const limit = { sourcesQueried: 17, stoppedBy: 'limit' } as const
  it('une source tombée interdit « volume demandé atteint » : le nombre reste, la cause se tait', () => {
    expect(effortConsistentWithFaults(limit, 1)).toEqual({ sourcesQueried: 17 })
    expect(effortConsistentWithFaults({ sourcesQueried: 4, stoppedBy: 'exhausted' }, 2)).toEqual({ sourcesQueried: 4 })
  })
  it('sans panne la cause reste ; le délai (time) reste toujours, il dit lui-même que la liste est coupée', () => {
    expect(effortConsistentWithFaults(limit, 0)).toEqual(limit)
    expect(effortConsistentWithFaults({ sourcesQueried: 3, stoppedBy: 'time' }, 2)).toEqual({
      sourcesQueried: 3,
      stoppedBy: 'time',
    })
    expect(effortConsistentWithFaults(undefined, 2)).toBeUndefined()
  })
})
