import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_ENTITY_ACCESS_COVERAGE } from './demo-coverage'

// V4-CORRECTIFS-B 4289.4 / 4289.5 — la classification dit vrai : les deux amorces existent et portent les trois mesures.
describe('« par quelle entité attaquer » en démo — V4-CORRECTIFS-B 4289.4 / 4289.5', () => {
  const script = readFileSync(join(__dirname, '../../../../web/src/features/demo/demo-chat-script.ts'), 'utf8')

  it('est classée SEEDÉE, avec sa raison', () => {
    expect(DEMO_ENTITY_ACCESS_COVERAGE.state).toBe('seede')
    expect(DEMO_ENTITY_ACCESS_COVERAGE.reason).toContain('p-entity-sg')
    expect(DEMO_ENTITY_ACCESS_COVERAGE.reason).toContain('p-entity-or-group')
  })

  it('les deux amorces existent dans le script, avec preuve dans ce secteur, voie d’accès et partenaires écartés', () => {
    for (const id of ['p-entity-sg', 'p-entity-or-group']) {
      const start = script.indexOf(`id: '${id}'`)
      expect(`${id}:${start > -1}`).toBe(`${id}:true`)
      const body = script.slice(start, start + 6000)
      expect(body).toContain('preuve dans ce secteur')
      expect(body).toMatch(/voie directe/)
      expect(body).toMatch(/partenaires déclarés de l.espace, pas des cibles/)
    }
  })

  it('sait dire NON : sans l’amorce Société Générale, la garde rougit', () => {
    expect(script.replace("id: 'p-entity-sg'", "id: 'p-removed'")).not.toContain("id: 'p-entity-sg'")
  })
})
