import { DEMO_RECETTE_X68_COVERAGE } from './demo-coverage'

/** Lot X68 (02/10) — la classification existe, avec sa raison ; les gardes de données sont voisines. */
describe('couverture démo — reliquats de recette Y18 (lot X68)', () => {
  it('classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_RECETTE_X68_COVERAGE.state).toBe('seede')
    expect(DEMO_RECETTE_X68_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
