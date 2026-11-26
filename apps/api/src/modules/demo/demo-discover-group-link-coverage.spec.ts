import { DEMO_DISCOVER_GROUP_LINK_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #3705.5 — « et en démonstration, la filiale d'un groupe sur Découvrir montre quoi ? »
 * Craft rule n°9 : aucun champ de table à lui ; ce fichier lit la VRAIE réponse scriptée.
 */
describe('#3705.5 — le rattachement de groupe, en démonstration', () => {
  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_DISCOVER_GROUP_LINK_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_GROUP_LINK_COVERAGE.reason).toContain('#3705.5')
  })

  it('la réponse scriptée porte UN lien sourcé, et les autres lignes aucun (une absence ne fait aucune ligne)', () => {
    const response = demoDiscoverResponse({}) as { candidates: Array<Record<string, unknown>> }
    const linked = response.candidates.filter(c => c['groupLink'] !== undefined)
    expect(linked.length).toBeGreaterThan(0)
    expect(linked.length).toBeLessThan(response.candidates.length)
    for (const candidate of linked) {
      const link = candidate['groupLink'] as { kind: string; entities: string[] }
      expect(['capital_link', 'legal_entity_officer']).toContain(link.kind)
      expect(link.entities.length).toBeGreaterThan(0)
    }
  })
})
