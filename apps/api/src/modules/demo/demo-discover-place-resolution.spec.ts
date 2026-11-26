import { DEMO_DISCOVER_PLACE_RESOLUTION_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4429.6 — « et en démonstration, Découvrir “Tolouse” montre quoi ? » (craft rule n°9)
 *
 * Comme le vrai chemin (`discover.py`, `place_resolution.py`) : une ville mal orthographiée est corrigée
 * par proximité, la correction est NOMMÉE (`query.placeResolution`) et la recherche part sur la commune
 * corrigée. Un nom exact ne dit rien ; un nom trop éloigné n'est jamais deviné.
 */
type Response = { candidates: { city: string | null }[]; query: Record<string, unknown> }

const run = (filters: Record<string, unknown>) => demoDiscoverResponse(filters) as unknown as Response

describe('#4429.6 — Découvrir « Tolouse » en démonstration', () => {
  it('corrige la ville par proximité, le dit, et cherche la commune corrigée', () => {
    const response = run({ city: 'Tolouse', includeOutOfTarget: true })
    expect(response.query.placeResolution).toMatchObject({ kind: 'corrected', typed: 'Tolouse', chosen: 'Toulouse' })
    expect(response.candidates[0]?.city).toBe('Toulouse')
  })

  it('dit NON : un nom exact, ou trop éloigné, ne porte aucune correction', () => {
    expect(run({ city: 'Toulouse', includeOutOfTarget: true }).query.placeResolution).toBeUndefined()
    expect(run({ city: 'Toulan', includeOutOfTarget: true }).query.placeResolution).toBeUndefined()
    expect(run({ includeOutOfTarget: true }).query.placeResolution).toBeUndefined()
  })

  it('est classé « seedé » avec sa raison', () => {
    expect(DEMO_DISCOVER_PLACE_RESOLUTION_COVERAGE.state).toBe('seede')
  })
})
