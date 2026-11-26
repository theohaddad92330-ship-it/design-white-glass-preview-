import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_QUIET_HOURS_COVERAGE } from './demo-coverage'

/**
 * Théo D settings-compte.N1 — la plage de tranquillité en démonstration : vide à
 * dessein, et la garde LIT les fichiers de semis pour le prouver — une plage
 * semée contredirait la raison écrite.
 */
describe('couverture démo — la plage de tranquillité (settings-compte.N1)', () => {
  it('est classée vide à dessein, avec sa raison', () => {
    expect(DEMO_QUIET_HOURS_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_QUIET_HOURS_COVERAGE.reason.length).toBeGreaterThan(80)
  })

  it('aucun fichier de semis n’écrit de plage de tranquillité', () => {
    for (const file of ['demo-dataset.ts', 'demo-seed.service.ts']) {
      const source = readFileSync(join(__dirname, file), 'utf8')
      expect(source.length).toBeGreaterThan(0)
      expect(source).not.toContain('quiet_hours')
    }
  })

  it('SAIT DIRE NON — un semis qui poserait une plage serait détecté (témoin)', () => {
    const tampered = "await prefs.insert({ user_id: id, quiet_hours_start: '21:00', quiet_hours_end: '07:00' })"
    expect(tampered).toContain('quiet_hours')
  })
})
