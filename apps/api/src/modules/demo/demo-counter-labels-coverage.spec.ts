import { DEMO_COUNTER_LABELS_COVERAGE } from './demo-coverage'

// Craft rule n°9 — #4612 / #4327.2 / #4493.4 / #4503.2 / #4613 / #4582.1 : les compteurs renommés se lisent en démonstration.
describe('démonstration — les compteurs renommés (26/10/2026)', () => {
  it('est classée seedée, avec sa raison écrite', () => {
    expect(DEMO_COUNTER_LABELS_COVERAGE.state).toBe('seede')
    expect(DEMO_COUNTER_LABELS_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
