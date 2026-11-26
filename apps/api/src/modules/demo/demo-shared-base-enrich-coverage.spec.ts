import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_SHARED_BASE_ENRICH_COVERAGE } from './demo-coverage'

/**
 * #4268.e — la nouveauté « Enrichir lit d'abord la base commune » est classée vide à dessein, et la
 * raison écrite est VRAIE : dans `enrichContact`, la sortie démo précède la lecture du commun.
 */
describe('#4268.e — la base commune à l’enrichissement : vide à dessein en démo, raison vérifiée', () => {
  const source = readFileSync(join(__dirname, '../contacts/contacts.service.ts'), 'utf8')
  const body = source.slice(source.indexOf('  async enrichContact('))

  it('est classée vide à dessein, avec son numéro et sa date', () => {
    expect(DEMO_SHARED_BASE_ENRICH_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_SHARED_BASE_ENRICH_COVERAGE.reason).toContain('#4268.b')
    expect(DEMO_SHARED_BASE_ENRICH_COVERAGE.reason).toContain('Louis 19/10/2026')
  })

  it('la salle sort AVANT la lecture du commun (l’ordre réel du code, pas un commentaire)', () => {
    const demoExit = body.indexOf('return this.enrichContactInDemo(contact)')
    const commonRead = body.indexOf('this.fillFromSharedBase(')
    expect(demoExit).toBeGreaterThan(0)
    expect(commonRead).toBeGreaterThan(0)
    expect(demoExit).toBeLessThan(commonRead)
  })
})
