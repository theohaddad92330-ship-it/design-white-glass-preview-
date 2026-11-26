import { DEMO_SURFACE_WIDENING_COVERAGE } from './demo-coverage'

/**
 * #4433.9 (épopée #4433) — craft rule n°9 : chaque surface qui s'élargit a sa réponse écrite pour la démo,
 * seedée ou vide à dessein AVEC sa raison. Jamais déplacée vers « vide » pour faire passer le test.
 */
describe('#4433.9 — les paliers des autres surfaces en démo', () => {
  it('Mes cibles / la veille : seedé, avec son appelant et sa preuve', () => {
    const { watchlist } = DEMO_SURFACE_WIDENING_COVERAGE
    expect(watchlist.state).toBe('seede')
    expect(watchlist.reason).toContain('buildWatchlistView')
    expect(watchlist.reason).toContain('demo-surface-widening-coverage.spec.ts')
  })

  it("l'analyse : vide à dessein, et la raison dit pourquoi et où c'est prouvé", () => {
    const { contactsAnalysis } = DEMO_SURFACE_WIDENING_COVERAGE
    expect(contactsAnalysis.state).toBe('vide_a_dessein')
    expect(contactsAnalysis.reason).toContain('coverage.widened')
    expect(contactsAnalysis.reason).toContain('OrgCoverageBanner.test.tsx')
  })
})
