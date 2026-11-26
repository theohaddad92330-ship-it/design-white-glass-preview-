import { DEMO_DISCOVER_LISTING_COVERAGE } from './demo-coverage'
import { DEMO_LISTED_COMPANY_NAMES, demoDiscoverResponse } from './demo-scripts'

/**
 * #4361.2 — « et en démonstration, "Exclure les sociétés cotées" montre quoi ? »
 *
 * Pas de table ni de clé `raw_analysis` : le filtre agit sur la liste scriptée de `/discover/registry`.
 * La salle rejoue la FORME du vrai chemin — la société prouvée cotée sort avec l'interrupteur, y reste
 * sans, et le compteur dit ce qui est retiré ET ce dont la cotation n'est pas établie. Lit la VRAIE
 * réponse scriptée (aucune liste recopiée à la main).
 */
type RawCandidate = { name: string }
type RawResponse = {
  candidates: RawCandidate[]
  listingFilter?: { applied: boolean; excludedCount: number; unknownCount: number; sourceAvailable: boolean }
}

const run = (filters: Record<string, unknown>) => demoDiscoverResponse(filters) as unknown as RawResponse
const names = (response: RawResponse) => response.candidates.map(c => c.name)

describe('#4361.2 — « Exclure les sociétés cotées » en démonstration', () => {
  it('sans interrupteur : les sociétés cotées restent, et il n’y a AUCUN compteur', () => {
    const response = run({ includeOutOfTarget: true })
    for (const listed of DEMO_LISTED_COMPANY_NAMES) expect(names(response)).toContain(listed)
    expect(response.listingFilter).toBeUndefined()
  })

  it('avec l’interrupteur : chaque société cotée de la salle sort de la liste', () => {
    const response = run({ includeOutOfTarget: true, excludeListed: true })
    for (const listed of DEMO_LISTED_COMPANY_NAMES) expect(names(response)).not.toContain(listed)
  })

  it('le compteur dit les retirées ET les cotations non établies (restées, jamais « non cotées »)', () => {
    const before = names(run({ includeOutOfTarget: true })).length
    const response = run({ includeOutOfTarget: true, excludeListed: true })
    expect(response.listingFilter).toEqual({
      applied: true,
      excludedCount: DEMO_LISTED_COMPANY_NAMES.length,
      unknownCount: before - DEMO_LISTED_COMPANY_NAMES.length,
      sourceAvailable: true,
    })
    expect(response.candidates.length).toBe(before - DEMO_LISTED_COMPANY_NAMES.length)
  })

  it('se combine avec la vue par défaut (la cible déclarée) sans la défaire', () => {
    const response = run({ excludeListed: true })
    for (const listed of DEMO_LISTED_COMPANY_NAMES) expect(names(response)).not.toContain(listed)
    expect(response.candidates.length).toBeGreaterThan(0)
    expect(response.listingFilter?.applied).toBe(true)
  })

  it('classe la capacité « seedée », avec le numéro du chantier', () => {
    expect(DEMO_DISCOVER_LISTING_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_LISTING_COVERAGE.reason).toContain('#4361.2')
    expect(DEMO_DISCOVER_LISTING_COVERAGE.reason).toContain('demo-discover-listing-coverage.spec.ts')
  })
})
