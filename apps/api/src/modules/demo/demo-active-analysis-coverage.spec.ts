import { DEMO_ACTIVE_ANALYSIS_BY_COLLEAGUE, DEMO_COLLEAGUES } from './demo-dataset'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2128.19 (recette D3 01/11) — la salle montre « une analyse en cours par un collègue » : un run `analyzing` d'un
 * collègue fictif sur SON compte, jamais sur un dossier vedette de l'occupant.
 */
describe('analyse en cours par un collègue (#2128.19)', () => {
  const { company, colleague, minutesAgo } = DEMO_ACTIVE_ANALYSIS_BY_COLLEAGUE

  it('vise un collègue réel de la salle, sur un compte QU’IL porte', () => {
    const found = DEMO_COLLEAGUES.find(entry => entry.key === colleague)
    expect(found).toBeDefined()
    expect(found?.accounts).toContain(company)
  })

  it('ne vise pas un dossier vedette de l’occupant', () => {
    expect(['Société Générale', 'SNCF', 'Groupe BPCE']).not.toContain(company)
  })

  it('est récente : un run « en cours » ancien se lirait bloqué', () => {
    expect(minutesAgo).toBeGreaterThan(0)
    expect(minutesAgo).toBeLessThanOrEqual(30)
  })

  it('le semis écrit un run `analyzing` au nom du collègue (pas de l’occupant)', () => {
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    const block = source.split('#2128.19 — une analyse EN COURS')[1]!.split('#4731')[0]!
    expect(block).toContain("'analyzing'")
    expect(block).toContain('runner.userId')
    expect(block).not.toContain('ownerUserId')
  })
})
