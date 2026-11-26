import { discoverResponseSchema } from '@bellum/contracts'
import { DEMO_DISCOVER_FRESH_WIDENING_COVERAGE } from './demo-coverage'
import { demoSkillSearchResponse } from './demo-discover-skill'
import { withDemoSignalNeighbour } from './demo-discover-widening'

/**
 * #4430 / #4437 (Louis 21/10/2026) — craft rule n°9 : la provenance d'un compte proposé se voit en démo.
 * Recherche par compétence : un compte « trouvé par une collecte d'offres fraîche », un autre aux offres
 * datées du cache. Mode Signaux avec un recrutement qualifié : un compte VOISIN étiqueté, sous l'exact.
 */
describe('#4430 / #4437 — offres fraîches et faits voisins en démo', () => {
  it('est classée seedée, avec son appelant', () => {
    expect(DEMO_DISCOVER_FRESH_WIDENING_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_FRESH_WIDENING_COVERAGE.reason).toContain('demo-discover-fresh-widening-coverage.spec.ts')
  })

  it('la recherche par compétence montre une collecte fraîche et une date d’offres', () => {
    const parsed = discoverResponseSchema.parse(demoSkillSearchResponse({ keywords: ['SAP'] }))
    expect(parsed.candidates.some(c => c.skillFreshFill === true)).toBe(true)
    expect(parsed.candidates.some(c => /^\d{4}-\d{2}-\d{2}$/.test(c.jobsAsOf ?? ''))).toBe(true)
  })

  it('un recrutement qualifié ajoute UN voisin étiqueté, daté, sous les comptes exacts', () => {
    const base = { candidates: [{ siren: '000000011' }], query: {}, degraded: [] }
    const out = withDemoSignalNeighbour(base, { keywords: ['react'], sources: ['hiring'] })
    const parsed = discoverResponseSchema.parse({
      ...out,
      candidates: out.candidates.slice(1),
    })
    const neighbour = parsed.candidates[0]
    expect(out.candidates[0]).toEqual({ siren: '000000011' })
    expect(neighbour?.widenedFrom).toEqual({ axis: 'signal', requested: ['hiring:react'], via: 'tender' })
    expect(neighbour?.signals[0]?.type).toBe('tender')
    expect(neighbour?.signals[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(parsed.widening).toEqual({ requested: ['hiring:react'], added: 1, via: ['hiring', 'capital'] })
  })

  it('sait dire NON : sans mot-clé, ou sans recrutement demandé, aucun voisin', () => {
    const base = { candidates: [], query: {}, degraded: [] }
    expect(withDemoSignalNeighbour(base, {})).toBe(base)
    expect(withDemoSignalNeighbour(base, { keywords: ['react'], sources: ['tender'] })).toBe(base)
  })
})
