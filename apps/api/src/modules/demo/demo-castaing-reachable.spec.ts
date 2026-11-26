import { demoDiscoverResponse } from './demo-scripts'
import { demoSkillSearchResponse } from './demo-discover-skill'

/**
 * #4819.4 — le cas semé doit être ATTEIGNABLE depuis la salle servie (craft rule n°9). Le contrôleur essaie d'abord la
 * recherche par COMPÉTENCE (`demoSkillSearchResponse`, dès qu'un mot-clé est posé), puis la liste scriptée : Castaing
 * Transports n'était que dans la seconde, donc « Java », « cyber » ou « transport » ne le rendaient jamais.
 * Ce spec rejoue l'ordre du contrôleur et échoue si le cas redevient introuvable.
 */
const CASTAING = 'Castaing Transports (démo)'

function served(query: Record<string, unknown>): string[] {
  const response = demoSkillSearchResponse(query) ?? demoDiscoverResponse(query)
  return (response.candidates as { name: string }[]).map(c => c.name)
}

describe('#4819.4 — Castaing Transports est atteignable dans la salle de démo', () => {
  it('vue par défaut', () => expect(served({})).toContain(CASTAING))
  it.each(['Java', 'cyber', 'transport', 'SAP'])('recherche par compétence « %s »', skill => {
    expect(served({ keywords: [skill] })).toContain(CASTAING)
  })
  it('recherche par technologie observée', () => {
    expect(served({ technologiesObserved: ['Java'] })).toContain(CASTAING)
  })
  it('recherche à Nantes, sur son NAF, sur son nom', () => {
    expect(served({ city: 'Nantes' })).toContain(CASTAING)
    expect(served({ nafCode: '49.41A' })).toContain(CASTAING)
    expect(served({ freetext: 'Castaing' })).toContain(CASTAING)
  })
})
