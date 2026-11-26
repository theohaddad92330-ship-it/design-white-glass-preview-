import { DEMO_DISCOVER_SIGNALS_PENDING_COVERAGE } from './demo-coverage'

/** #4677 — l'état « signaux en cours » est classé vide à dessein, avec une raison écrite (craft rule n°9). */
describe('démo — signaux en cours (#4677)', () => {
  it('est classé « vide à dessein » avec sa raison', () => {
    expect(DEMO_DISCOVER_SIGNALS_PENDING_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_DISCOVER_SIGNALS_PENDING_COVERAGE.reason).toContain('scriptée')
    expect(DEMO_DISCOVER_SIGNALS_PENDING_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
