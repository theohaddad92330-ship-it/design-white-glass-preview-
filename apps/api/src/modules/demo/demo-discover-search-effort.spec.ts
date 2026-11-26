import { DEMO_DISCOVER_SEARCH_EFFORT_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4305.2 — « et en démonstration, Découvrir dit l'effort de la recherche ? » (craft rule n°9)
 *
 * Comme le vrai chemin (`discover.py::_search_effort`) : `query.searchEffort` porte le nombre de sources
 * interrogées et ce qui a arrêté la recherche — jamais un crédit, jamais un fournisseur.
 */
type Response = { candidates: unknown[]; query: Record<string, unknown> }

describe('#4305.2 — Découvrir dit son effort en démonstration', () => {
  it('rend sourcesQueried et stoppedBy, deux faits et rien d’autre', () => {
    const response = demoDiscoverResponse({ includeOutOfTarget: true }) as unknown as Response
    const effort = response.query.searchEffort as Record<string, unknown>
    expect(Object.keys(effort).sort()).toEqual(['sourcesQueried', 'stoppedBy'])
    expect(effort.sourcesQueried).toBeGreaterThan(0)
    expect(['limit', 'time', 'exhausted']).toContain(effort.stoppedBy)
  })

  it('dit NON : une liste vide ne prétend pas avoir interrogé des sources', () => {
    const response = demoDiscoverResponse({ keywords: ['zzzz-aucun-compte'] }) as unknown as Response
    if (response.candidates.length === 0) expect(response.query.searchEffort).toBeUndefined()
  })

  it('est classé « seedé » avec sa raison', () => {
    expect(DEMO_DISCOVER_SEARCH_EFFORT_COVERAGE.state).toBe('seede')
  })
})
