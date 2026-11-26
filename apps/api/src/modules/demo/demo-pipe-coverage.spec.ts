import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_PIPE_COVERAGE, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_PURGE_TABLES } from './demo-reset.service'

/**
 * L2 Pipe en démo — chaque nouveauté est CLASSÉE : seedée (et le semis existe
 * vraiment), ou vide à dessein (avec sa raison écrite).
 */
describe('couverture démo de /pilotage/pipe', () => {
  const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

  it('le journal des montants et dates est une table seedée, purgée à la remise à zéro', () => {
    expect(DEMO_SEEDED_TABLES).toContain('opportunity_field_changes')
    expect(DEMO_PURGE_TABLES).toContain('opportunity_field_changes')
    expect(seed).toContain('INSERT INTO opportunity_field_changes')
  })

  it('le semis écrit la catégorie déclarée et appelle seedPipeDeclarations', () => {
    expect(seed).toContain('forecast_category')
    expect(seed).toContain('await this.seedPipeDeclarations(')
  })

  it('chaque bloc seedé dit où ; le seul vide à dessein est le multi-commercial, avec sa raison', () => {
    for (const reason of Object.values(DEMO_PIPE_COVERAGE.seeded)) expect(reason.length).toBeGreaterThan(20)
    expect(Object.keys(DEMO_PIPE_COVERAGE.intentionallyEmpty)).toEqual(['byOwnerMultiCommercial'])
    expect(DEMO_PIPE_COVERAGE.intentionallyEmpty.byOwnerMultiCommercial).toContain('coéquipiers fictifs')
  })
})
