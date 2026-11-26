import { recentHires, type RecentHireContact } from '@bellum/contracts'
import { densifiedContactsFor, resolveDemoEmployment } from './demo-contact-density'
import { DEMO_RECENT_HIRES_COVERAGE } from './demo-coverage'
import { DEMO_ESN_PROFILE } from './demo-dataset'

/**
 * #3970 (lot P07) — ce que la salle MONTRE dans « Recrutements récents », exécuté
 * sur le jeu réel avec le profil de la salle (jamais une relecture du commentaire).
 */
const NOW = Date.parse('2026-10-09T12:00:00Z')
const PROFILE = {
  personas: [...DEMO_ESN_PROFILE.decision_maker_personas],
  placedRoles: [...DEMO_ESN_PROFILE.placed_roles],
}

function hiresAt(company: string, nowMs = NOW) {
  const contacts: RecentHireContact[] = densifiedContactsFor(company).map((contact, index) => ({
    id: `${company}-${index}`,
    full_name: contact.full_name,
    title: contact.title,
    email: contact.email,
    phone: contact.phone ?? null,
    linkedin_url: null,
    apollo_enrichment: resolveDemoEmployment(contact.apollo_enrichment, nowMs),
  }))
  return recentHires(contacts, { companyName: company, profile: PROFILE, nowMs })
}

describe('démo — recrutements récents (#3970)', () => {
  it('est classée SEMÉE dans demo-coverage.ts', () => {
    expect(DEMO_RECENT_HIRES_COVERAGE.state).toBe('seede')
  })

  it('Société Générale : un DSI de la persona et deux métiers placés, avec leurs raisons', () => {
    const hires = hiresAt('Société Générale')
    expect(hires.map(hire => hire.name)).toEqual(['Nicolas Ferrand', 'Julien Peltier', 'Marc Delaunay'])
    expect(hires.every(hire => hire.relevance.status === 'pertinent')).toBe(true)
    expect(hires[0]?.relevance.reasonFr).toContain('persona')
    expect(hires[1]?.relevance.reasonFr).toContain('« Data »')
    expect(hires[2]?.relevance.reasonFr).toContain('« Cloud »')
  })

  it('SNCF : la raison « hors contexte » se montre aussi', () => {
    const statuses = hiresAt('SNCF').map(hire => hire.relevance.status)
    expect(statuses).toEqual(['pertinent', 'hors_metier'])
  })

  it('sait dire NON : les dates sont relatives au seed — elles restent dans la fenêtre quel que soit le jour', () => {
    const later = Date.parse('2027-06-01T12:00:00Z')
    expect(hiresAt('Société Générale', later)).toHaveLength(3)
  })

  it('aucune arrivée n’est inventée sur une personne réelle du registre', () => {
    const withHire = densifiedContactsFor('Société Générale').filter(contact =>
      contact.apollo_enrichment?.employment_history.some(entry => entry.started_days_ago !== undefined),
    )
    expect(withHire.every(contact => contact.profile_summary.includes('simulé'))).toBe(true)
  })
})
