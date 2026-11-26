import { DEMO_DISCOVER_WORKED_ACCOUNTS_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4294.7 — « et en démonstration, « Déjà travaillées » retient-il un compte ? »
 *
 * Craft rule n°9 : `workedBefore` voyage sur la réponse scriptée de `/discover`, sans table ni clé `raw_analysis`.
 * Ce fichier lit la VRAIE réponse scriptée, sans `discoverResponseSchema.parse` qui retirerait un champ non déclaré.
 */
type RawCandidate = { name: string; sector: string | null; portfolioState: string; workedBefore?: true }

describe('#4294.7 — « Déjà travaillées », en démonstration', () => {
  const view = demoDiscoverResponse({}) as { candidates: RawCandidate[] }
  const worked = view.candidates.filter(c => c.workedBefore === true)

  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_DISCOVER_WORKED_ACCOUNTS_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_WORKED_ACCOUNTS_COVERAGE.reason).toContain('#4294.7')
  })

  it('au moins un compte de la vue par défaut est déjà travaillé, et c’est un client', () => {
    expect(worked.map(c => c.name)).toContain('Cévennes Défense Systèmes (démo)')
    for (const c of worked) expect(c.portfolioState).toBe('customer')
  })

  it('sait dire NON : un candidat neuf n’est jamais marqué travaillé (clé absente, pas `false`)', () => {
    const fresh = view.candidates.filter(c => c.portfolioState === 'new')
    expect(fresh.length).toBeGreaterThan(0)
    for (const c of fresh) expect('workedBefore' in c).toBe(false)
  })
})
