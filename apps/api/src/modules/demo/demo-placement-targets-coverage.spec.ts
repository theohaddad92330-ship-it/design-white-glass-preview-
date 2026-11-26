import { DEMO_PLACEMENT_TARGETS_COVERAGE } from './demo-coverage'

describe('LUD.4 bis — « Où placer ce profil ? » non-IT, classé en démo', () => {
  it('est vide à dessein, avec sa raison écrite', () => {
    expect(DEMO_PLACEMENT_TARGETS_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_PLACEMENT_TARGETS_COVERAGE.reason).toContain('LUD.4 bis')
    expect(DEMO_PLACEMENT_TARGETS_COVERAGE.reason).toContain('NON-IT')
  })
})
