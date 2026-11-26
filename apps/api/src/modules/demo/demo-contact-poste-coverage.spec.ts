import { DEMO_CONTACT_POSTE_COVERAGE } from './demo-coverage'
import { DENSIFIED_COMPANIES, densifiedContactsFor, resolveDemoEmployment } from './demo-contact-density'

/**
 * #4465 — ce que la salle MONTRE : un contact à plusieurs postes dont UN en cours, et un contact parti (poste chez le
 * compte daté de fin, poste en cours ailleurs). Exécuté sur le jeu réel, jamais une relecture du commentaire.
 */
const NOW = Date.parse('2026-10-25T12:00:00Z')

const all = DENSIFIED_COMPANIES.flatMap(company =>
  densifiedContactsFor(company).map(contact => ({
    company,
    contact,
    history: resolveDemoEmployment(contact.apollo_enrichment, NOW)?.employment_history ?? [],
  })),
)

describe('démo — le poste en cours et le départ (#4465)', () => {
  it('est classée SEMÉE dans demo-coverage.ts', () => {
    expect(DEMO_CONTACT_POSTE_COVERAGE.state).toBe('seede')
  })

  it('sème des contacts à trois postes dont exactement un « Actuel », chez le compte', () => {
    const multi = all.filter(({ history }) => history.length >= 3)
    expect(multi.length).toBeGreaterThanOrEqual(1)
    for (const { company, contact, history } of multi) {
      const current = history.filter(entry => entry.current)
      expect(current).toHaveLength(1)
      // Une filiale du groupe (« SNCF Voyageurs » pour SNCF) reste chez le compte : le nom du compte y figure.
      expect(current[0]?.organization_name).toContain(company)
      expect(current[0]?.title).toBe(contact.title)
    }
  })

  it('sème un contact PARTI : poste chez le compte daté de fin, poste en cours ailleurs', () => {
    const departed = all.filter(({ contact }) => contact.lifecycle_state === 'historique')
    expect(departed.length).toBeGreaterThanOrEqual(1)
    for (const { company, history } of departed) {
      const here = history.find(entry => entry.organization_name === company)
      expect(here?.current).toBe(false)
      expect((here as { end_date?: string } | undefined)?.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(history.find(entry => entry.current)?.organization_name).not.toBe(company)
    }
  })

  it('sait dire NON : sans `ended_days_ago`, aucune date de fin n’est inventée', () => {
    const resolved = resolveDemoEmployment(
      { employment_history: [{ organization_name: 'X', current: true, started_days_ago: 10 }] },
      NOW,
    )
    expect(resolved?.employment_history[0]).not.toHaveProperty('end_date')
  })
})
