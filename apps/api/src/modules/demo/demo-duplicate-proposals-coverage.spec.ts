import { proposeContactDuplicates } from '../contacts/contact-duplicate-proposals'
import { DEMO_CONTACT_DUPLICATE_PROPOSALS_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/** #4114 — classé « seedé » : la garde échoue si la démo ne rend plus AUCUNE paire proposée. */
describe('#4114 — propositions de doublons de personnes en démonstration (seedées par les contacts existants)', () => {
  it('est classé « seedé », avec sa raison', () => {
    expect(DEMO_CONTACT_DUPLICATE_PROPOSALS_COVERAGE.state).toBe('seede')
    expect(DEMO_CONTACT_DUPLICATE_PROPOSALS_COVERAGE.reason).toContain('#4114')
  })

  it('la démo rend au moins une paire proposée', () => {
    let total = 0
    for (const dossier of DEMO_DOSSIERS) {
      const rows = (dossier.contacts ?? []).map((c, i) => ({
        id: String(i),
        accountId: 'a',
        fullName: c.full_name ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        linkedinUrl: c.linkedin_url ?? null,
        title: c.title ?? null,
      }))
      total += proposeContactDuplicates(rows).length
    }
    expect(total).toBeGreaterThan(0)
  })
})
