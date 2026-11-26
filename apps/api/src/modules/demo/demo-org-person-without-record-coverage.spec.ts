import { orgGraphSchema } from '@bellum/contracts'
import { orgPersonSlug } from '@bellum/utils'
import { DEMO_ORG_PERSON_CREATE_RECORD_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'
import { DEMO_ORG_PEOPLE_WITHOUT_RECORD } from './demo-org-graphs'

/**
 * #4509 (décision Louis 24/10) — « Créer sa fiche » dans le panneau d'un nœud d'organigramme sans fiche contact.
 * En démonstration, le geste n'a de quoi s'afficher que si au moins un dossier porte une personne du graphe SANS
 * fiche semée : la preuve est sur les données, pas dans un commentaire.
 */
describe('« Créer sa fiche » en démonstration (#4509)', () => {
  it('est classé seedé, avec sa raison écrite', () => {
    expect(DEMO_ORG_PERSON_CREATE_RECORD_COVERAGE.state).toBe('seede')
    expect(DEMO_ORG_PERSON_CREATE_RECORD_COVERAGE.reason).toContain('4509')
  })

  it('au moins un dossier de la salle porte une personne d’organigramme sans fiche contact semée', () => {
    const withoutRecord = DEMO_DOSSIERS.flatMap(dossier => {
      const org = (dossier.account.raw_analysis as { org?: { orgGraph?: unknown } }).org
      const graph = orgGraphSchema.parse(org?.orgGraph)
      const slugs = new Set(dossier.contacts.map(contact => orgPersonSlug(contact.full_name)))
      return graph.people
        .filter(person => !slugs.has(person.id))
        .map(person => `${dossier.account.company_name}/${person.fullName}`)
    })
    expect(withoutRecord.length).toBeGreaterThan(0)
    // Et chacune est NOMMÉE dans l'exemption : aucune personne sans fiche par accident.
    const named = Object.entries(DEMO_ORG_PEOPLE_WITHOUT_RECORD).flatMap(([company, names]) =>
      names.map(name => `${company}/${name}`),
    )
    expect([...withoutRecord].sort()).toEqual([...named].sort())
  })
})
