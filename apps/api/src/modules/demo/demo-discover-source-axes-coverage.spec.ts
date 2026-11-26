import { decisiveSourceAxes, discoverResponseSchema } from '@bellum/contracts'
import { DEMO_DISCOVER_SOURCE_AXES_COVERAGE, DEMO_HISTORICAL_NEEDS_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4067 — « et en démonstration, les sources qui pèsent dans le classement
 * Découvrir (historique, CRM, mémoire marché, référentiel, Drive, missions)
 * montrent quoi ? »
 *
 * Craft rule n°9 : `sourceAxes` voyage sur la réponse de `/discover`, sans
 * table ni clé `raw_analysis` à lui. Ce fichier lit la VRAIE réponse scriptée.
 */
describe('#4067 — les axes de sources de Découvrir, en démonstration', () => {
  it('sont classés seedés, avec leur raison', () => {
    expect(DEMO_DISCOVER_SOURCE_AXES_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_SOURCE_AXES_COVERAGE.reason).toContain('#4067')
  })

  it('la vue PAR DÉFAUT montre au moins une ligne « Pourquoi » avec un signal ANCIEN daté', () => {
    const parsed = discoverResponseSchema.parse(demoDiscoverResponse({}))
    const withWhy = parsed.candidates.filter(c => decisiveSourceAxes(c.sourceAxes).length > 0)
    expect(withWhy.length).toBeGreaterThan(0)
    const history = parsed.candidates
      .flatMap(c => c.sourceAxes?.axes ?? [])
      .find(axis => axis.key === 'signal_history' && axis.points > 0)
    expect(history?.latestAt).toEqual(expect.any(String))
  })

  it('chacune des six sources pèse sur au moins une carte de la salle', () => {
    const parsed = discoverResponseSchema.parse(demoDiscoverResponse({ includeOutOfTarget: true }))
    const weighing = new Set(
      parsed.candidates.flatMap(c => (c.sourceAxes?.axes ?? []).filter(a => a.points > 0).map(a => a.key)),
    )
    expect([...weighing].sort()).toEqual(['crm', 'dataforge', 'drive', 'market_memory', 'missions', 'signal_history'])
  })

  it('une carte sans fait de démo reste NON MESURÉE — jamais des zéros', () => {
    const parsed = discoverResponseSchema.parse(demoDiscoverResponse({ includeOutOfTarget: true }))
    const bare = parsed.candidates.find(c => c.sourceAxes?.score === null)
    expect(bare?.sourceAxes?.unmeasured).toHaveLength(6)
  })

  // #4294.9 — le référentiel pèse aussi par les besoins PASSÉS observés sur le compte (fictifs), datés.
  it('#4294.9 — une carte de la salle montre des besoins passés observés, datés', () => {
    const parsed = discoverResponseSchema.parse(demoDiscoverResponse({ includeOutOfTarget: true }))
    const axis = parsed.candidates
      .flatMap(c => c.sourceAxes?.axes ?? [])
      .find(a => a.key === 'dataforge' && a.label_key === 'reference_needs_won')
    expect(axis?.label_params).toEqual({ n: 3, won: 1 })
    expect(axis?.latestAt).toEqual(expect.any(String))
    expect(axis?.evidence).not.toMatch(/dataforge|orion/i)
    expect(DEMO_HISTORICAL_NEEDS_COVERAGE.state).toBe('seede')
    expect(DEMO_HISTORICAL_NEEDS_COVERAGE.reason).toContain('Cévennes Défense Systèmes')
  })

  // #4067.11 (#4286.15.d) — la base commune pèse aussi en salle : des personnes en poste FICTIVES déjà
  // connues chez Marenval Financement, un compte, jamais un nom ni une source.
  it('#4067.11 — une carte de la salle montre des personnes en poste connues de la base commune', () => {
    const parsed = discoverResponseSchema.parse(demoDiscoverResponse({ includeOutOfTarget: true }))
    const axis = parsed.candidates
      .flatMap(c => c.sourceAxes?.axes ?? [])
      .find(a => a.key === 'market_memory' && a.label_key === 'market_shared_people')
    expect(axis?.measured).toBe(true)
    expect(axis?.label_params).toEqual(expect.objectContaining({ n: 3 }))
    expect(DEMO_DISCOVER_SOURCE_AXES_COVERAGE.reason).toContain('#4067.11')
  })
})
