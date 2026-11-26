import { DEMO_DISCOVER_FUNNEL_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4419 — « et en démonstration, Découvrir dit-il entrés / retenus / écartés ? » (craft rule n°9)
 *
 * Comme le vrai chemin (`query.funnel`, apps/ia `discover_funnel.py`) : « Toulouse » ne garde que les comptes de la
 * ville, les autres comptes de la salle sont ÉCARTÉS « hors ville » (puis rendus à part par l'élargissement de zone).
 */
type Response = {
  candidates: unknown[]
  query: { funnel?: { entered?: number; kept: number; rejected: Record<string, number> } }
  zoneWidening?: { exactCount: number; widenedCount: number }
}

const run = (filters: Record<string, unknown>) => demoDiscoverResponse(filters) as unknown as Response

describe('#4419 — l’entonnoir de rejet en démonstration', () => {
  it('« Toulouse » : retenus = comptes de la ville, écartés hors ville = le reste de la salle', () => {
    const response = run({ city: 'Toulouse', includeOutOfTarget: true })
    const funnel = response.query.funnel
    expect(funnel).toBeDefined()
    expect(funnel?.kept).toBe(response.zoneWidening?.exactCount)
    expect(funnel?.rejected.city).toBe(response.zoneWidening?.widenedCount)
    expect(funnel?.entered).toBe((funnel?.kept ?? 0) + (funnel?.rejected.city ?? 0))
  })

  it('dit NON : sans ville, ou en « Toulouse seule », aucun critère de ville n’a rien écarté', () => {
    expect(run({ includeOutOfTarget: true }).query.funnel).toBeUndefined()
    expect(
      run({ city: 'Toulouse', zoneStrict: true, includeOutOfTarget: true }).query.funnel?.rejected.city,
    ).toBeUndefined()
  })

  it('est classé « seedé » avec sa raison', () => {
    expect(DEMO_DISCOVER_FUNNEL_COVERAGE.state).toBe('seede')
  })
})
