import { DEMO_DISCOVER_SIGNAL_GRID_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4115 (craft rule n°9) — la grille de signaux de Découvrir est SEMÉE dans la
 * salle : un compte de la vue par défaut porte exactement 5 signaux FORTS et 10
 * de CONTEXTE (le plafond de la règle Louis du 13/10), classés par la grille
 * (`apps/ia/app/services/discover_signal_grid.py`), sans offre de stage et
 * sans aucun champ de probabilité.
 */
type RawSignal = { type: string; label: string; date: string; tier?: 'strong' | 'context' }
type RawCandidate = { name: string; signals: RawSignal[] }

const defaultView = () => (demoDiscoverResponse({}) as { candidates: RawCandidate[] }).candidates
const grid = () => defaultView().find(c => c.signals.some(s => s.tier))

describe('#4115 — la grille de signaux est visible dans la salle démo', () => {
  it('un compte de la vue par défaut porte 5 signaux forts et 10 de contexte', () => {
    expect(DEMO_DISCOVER_SIGNAL_GRID_COVERAGE.state).toBe('seede')
    const candidate = grid()
    expect(candidate).toBeDefined()
    expect(candidate?.signals.filter(s => s.tier === 'strong')).toHaveLength(5)
    expect(candidate?.signals.filter(s => s.tier === 'context')).toHaveLength(10)
    expect(candidate?.signals.every(s => s.tier === 'strong' || s.tier === 'context')).toBe(true)
  })

  it('les forts précèdent le contexte, chaque tranche du plus frais au plus ancien', () => {
    const signals = grid()?.signals ?? []
    const firstContext = signals.findIndex(s => s.tier === 'context')
    expect(signals.slice(0, firstContext).every(s => s.tier === 'strong')).toBe(true)
    for (const tier of ['strong', 'context'] as const) {
      const dates = signals.filter(s => s.tier === tier).map(s => s.date)
      expect(dates).toEqual([...dates].sort().reverse())
    }
  })

  it('sait dire NON : aucune offre de stage, aucun champ de probabilité', () => {
    for (const candidate of defaultView()) {
      for (const signal of candidate.signals) {
        expect(signal.label).not.toMatch(/\b(stages?|stagiaires?|internships?)\b/i)
        expect(Object.keys(signal).join(' ')).not.toMatch(/prob|chance|percent|likelihood/i)
      }
    }
  })
})
