import { DEMO_DISCOVER_DELIVERY_FIT_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #3237 (#3203.4/.5) — « et en démonstration, le delivery fit d'un signal
 * montre quoi ? » Recette prod 01/10 : « aucun axe visible dans les cartes
 * /discover (0 occurrence delivery/langue/fuseau) » — la salle n'avait aucune
 * offre portant un marqueur explicite. Ce fichier lit la VRAIE réponse
 * scriptée (sans `.parse` : ces champs voyagent hors contrat, comme les
 * autres champs d'extraction).
 */
type Level = 'compatible' | 'potentially_compatible' | 'unknown' | 'incompatible'
type RawSignal = { type: string; deliveryFit?: Level; deliveryFitAxes?: Record<string, Level> }
type RawCandidate = { name: string; signals: RawSignal[] }

const THIRTEEN = [
  'site_presence',
  'presence_frequency',
  'authorized_countries',
  'languages',
  'timezones',
  'security',
  'sensitive_data',
  'mandated_equipment',
  'clearances',
  'contractual_status',
  'team_model',
  'travel',
  'source_freshness',
]

const allSignals = (query: Record<string, unknown>): RawSignal[] =>
  (demoDiscoverResponse(query) as { candidates: RawCandidate[] }).candidates.flatMap(c => c.signals ?? [])

describe('#3237 — delivery fit des signaux Découvrir, en démonstration', () => {
  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_DISCOVER_DELIVERY_FIT_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_DELIVERY_FIT_COVERAGE.reason).toContain('#3237')
  })

  it('la VUE PAR DÉFAUT montre un niveau compatible ET un niveau incompatible', () => {
    const levels = allSignals({})
      .map(s => s.deliveryFit)
      .filter(Boolean)
    expect(levels).toContain('incompatible')
    expect(levels).toContain('potentially_compatible')
  })

  it('un signal avec delivery fit porte TOUJOURS les treize axes, jamais un axe omis', () => {
    const withFit = allSignals({ includeOutOfTarget: true }).filter(s => s.deliveryFit)
    expect(withFit.length).toBeGreaterThanOrEqual(3)
    for (const signal of withFit) {
      expect(Object.keys(signal.deliveryFitAxes ?? {}).sort()).toEqual([...THIRTEEN].sort())
    }
  })

  it('le niveau composé suit la règle : un axe incompatible l’emporte, un unknown n’est jamais promu', () => {
    for (const signal of allSignals({ includeOutOfTarget: true }).filter(s => s.deliveryFit)) {
      const evaluated = Object.values(signal.deliveryFitAxes ?? {}).filter(l => l !== 'unknown')
      if (evaluated.includes('incompatible')) expect(signal.deliveryFit).toBe('incompatible')
      else if (evaluated.includes('potentially_compatible')) expect(signal.deliveryFit).toBe('potentially_compatible')
      else if (evaluated.length > 0) expect(signal.deliveryFit).toBe('compatible')
      else expect(signal.deliveryFit).toBe('unknown')
    }
  })
})
