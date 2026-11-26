import { discoverResponseSchema } from '@bellum/contracts'
import { DEMO_DISCOVER_COMMON_BASE_COVERAGE } from './demo-coverage'
import { withDemoCommonBase } from './demo-discover-common-base'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4793.1 / #4791.2 (Louis 31/10/2026) — craft rule n°9 : les candidats de la base commune, avec leur besoin
 * HISTORIQUE daté, se voient en démo sur la recherche Découvrir existante.
 */
describe('#4793.1 — la base commune en démo', () => {
  it('est classée seedée, avec son appelant', () => {
    expect(DEMO_DISCOVER_COMMON_BASE_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_COMMON_BASE_COVERAGE.reason).toContain('demo-discover-common-base-coverage.spec.ts')
  })

  it('la recherche démo porte au moins 3 comptes de la base commune au besoin historique daté', () => {
    const parsed = discoverResponseSchema.parse(withDemoCommonBase(demoDiscoverResponse({})))
    const withNeed = parsed.candidates.filter(c => c.observedNeed)
    expect(withNeed.length).toBeGreaterThanOrEqual(3)
    const today = new Date().toISOString().slice(0, 10)
    expect(withNeed.every(c => /^\d{4}-\d{2}-\d{2}$/.test(c.observedNeed!.date) && c.observedNeed!.date < today)).toBe(
      true,
    )
    // Historique : au moins un besoin de plus d'un an.
    const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)
    expect(withNeed.some(c => c.observedNeed!.date < yearAgo)).toBe(true)
  })

  it('sait dire NON : un SIREN déjà dans la liste ne sort pas deux fois, aucune source nommée', () => {
    const once = withDemoCommonBase({ candidates: [{ siren: '000000092' }] })
    expect(once.candidates.filter(c => (c as { siren: string }).siren === '000000092')).toHaveLength(1)
    expect(JSON.stringify(once)).not.toMatch(/dataforge|orion|market|base commune/i)
  })

  // #5203 (lot 782) — craft rule n°9 : la nature et les filtres de besoins se voient en démo.
  it('#5203 — chaque besoin de démo porte sa nature ; les trois natures sont représentées', () => {
    const needs = withDemoCommonBase(demoDiscoverResponse({})).candidates.flatMap(c =>
      (c as { observedNeed?: { nature?: string } }).observedNeed
        ? [(c as never as { observedNeed: { nature?: string } }).observedNeed]
        : [],
    )
    expect(needs.every(need => typeof need.nature === 'string')).toBe(true)
    expect(new Set(needs.map(need => need.nature))).toEqual(new Set(['recrutement', 'mission', 'projet']))
  })

  it('#5203 — les filtres période et nature RETIRENT en salle comme en vrai', () => {
    const sirensOf = (filters: Parameters<typeof withDemoCommonBase>[1]) =>
      withDemoCommonBase({ candidates: [] as unknown[] }, filters).candidates.map(c => (c as { siren: string }).siren)
    const all = sirensOf({})
    const old = sirensOf({ needsPeriod: 'old' })
    const recent = sirensOf({ needsPeriod: 'recent' })
    expect(all.length).toBeGreaterThanOrEqual(4)
    expect(old.length).toBeGreaterThan(0)
    expect(recent.length).toBeGreaterThan(0)
    expect(old.length + recent.length).toBe(all.length)
    expect(sirensOf({ needsNature: ['mission'] }).length).toBeLessThan(all.length)
  })
})
