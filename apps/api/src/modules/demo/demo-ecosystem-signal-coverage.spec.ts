import { DEMO_ECOSYSTEM_SIGNAL_COVERAGE } from './demo-coverage'

/**
 * #4734 (craft rule n°9) — le signal d'écosystème est classé « vide à dessein » AVEC sa raison : aucun compte de la
 * salle ne porte une appartenance affirmée sur une entreprise réelle, et aucun annuaire n'est interrogé en démonstration.
 */
describe('#4734 — signal d’écosystème en démonstration', () => {
  it('est classé vide à dessein, avec une raison écrite', () => {
    expect(DEMO_ECOSYSTEM_SIGNAL_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_ECOSYSTEM_SIGNAL_COVERAGE.reason).toContain('#4734')
    expect(DEMO_ECOSYSTEM_SIGNAL_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
