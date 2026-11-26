import { DEMO_THEO_BESOINS_COVERAGE } from './demo-coverage'
import { DEMO_FLAGSHIP_NEED_SOURCE_URL } from './demo-dataset'

// Théo C projects-besoins — « sources cliquables » : le besoin phare de la salle porte la page d'origine
// de son offre, une vraie page publique (jamais un domaine inventé).
describe('Théo C projects-besoins — la source du besoin phare de la démo', () => {
  it('est une URL https vers une vraie page, pas un domaine d’exemple', () => {
    const url = new URL(DEMO_FLAGSHIP_NEED_SOURCE_URL)
    expect(url.protocol).toBe('https:')
    expect(url.hostname).not.toMatch(/example|invalid|test|localhost/i)
  })

  it('est classée « seedée » dans la couverture de la démo, avec sa raison', () => {
    expect(DEMO_THEO_BESOINS_COVERAGE.state).toBe('seede')
    expect(DEMO_THEO_BESOINS_COVERAGE.reason).toContain('Périmé')
  })
})
