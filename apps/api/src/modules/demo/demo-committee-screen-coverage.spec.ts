import { orgGraphSchema } from '@bellum/contracts'
import { DEMO_BRIEF_THIN_COMPANIES } from './commercial-brief-seed'
import { DEMO_COMMITTEE_SCREEN_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3282 (#3263.39) — « et en démonstration, l'écran Comité d'achat montre quoi ? »
 * Il relit `raw_analysis.org.orgGraph.buyingCommittee` : la preuve est donc SUR LES
 * DONNÉES, pas dans un commentaire (une classification affirme, la garde vérifie).
 */
describe('écran Comité d’achat en démonstration (#3282)', () => {
  it('est classé seedé, avec sa raison écrite', () => {
    expect(DEMO_COMMITTEE_SCREEN_COVERAGE.state).toBe('seede')
    expect(DEMO_COMMITTEE_SCREEN_COVERAGE.reason).toContain('3282')
  })

  for (const dossier of DEMO_DOSSIERS) {
    it(`${dossier.account.company_name} : au moins cinq sièges occupés par des personnes du graphe`, () => {
      const org = (dossier.account.raw_analysis as { org?: { orgGraph?: unknown } }).org
      const graph = orgGraphSchema.parse(org?.orgGraph)
      const peopleIds = new Set(graph.people.map(p => p.id))
      const occupied = graph.buyingCommittee.filter(seat => peopleIds.has(seat.personId))
      // EXEMPTION NOMMÉE (04/10/2026) : Naval Group et Chantiers de l'Atlantique — le classeur nomme 1 et 3 décideurs
      // (voir DEMO_BRIEF_THIN_COMPANIES). Plancher réduit à 1 : un siège de plus serait une personne inventée.
      const floor = DEMO_BRIEF_THIN_COMPANIES.includes(dossier.account.company_name) ? 1 : 5
      expect(occupied.length).toBeGreaterThanOrEqual(floor)
    })
  }
})
