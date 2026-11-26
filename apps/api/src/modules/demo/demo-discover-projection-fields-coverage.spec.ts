import { DEMO_DISCOVER_PROJECTION_FIELDS_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'
import { demoLocation } from './demo-contact-profile'

/**
 * #4634 (craft rule n°9) — les critères de personnes du volet de Découvrir cherchent dans `GET /contacts` : en salle
 * de démonstration, ils doivent avoir de quoi trouver. La spec confronte les champs que le volet envoie (fonction,
 * localisation, relation) au jeu seedé, plutôt que de supposer qu'il est rempli.
 */
describe('couverture démo — Découvrir : critères de personnes dans le volet (#4634)', () => {
  const contacts = DEMO_DOSSIERS.flatMap(dossier => dossier.contacts)

  it('le classement est « seedé », avec sa raison écrite', () => {
    expect(DEMO_DISCOVER_PROJECTION_FIELDS_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_PROJECTION_FIELDS_COVERAGE.reason.length).toBeGreaterThan(40)
  })

  it('SAIT DIRE NON — le jeu porte des personnes avec une fonction renseignée', () => {
    expect(contacts.filter(contact => contact.title.trim().length > 0).length).toBeGreaterThan(0)
  })

  // Le lieu n'est pas écrit au jeu de données : `DemoSeedService` le DÉRIVE du siège du dossier (`demoLocation`,
  // #2165.38) quand le contact ne le déclare pas. La spec confronte donc ce que le semis écrira, pas le champ brut.
  it('« Localisation » a de quoi chercher : le semis écrit un lieu de travail pour les personnes des dossiers', () => {
    const seeded = DEMO_DOSSIERS.flatMap(dossier =>
      dossier.contacts.map(contact =>
        contact.location !== undefined ? contact.location : demoLocation(contact, dossier.account),
      ),
    )
    expect(seeded.filter(location => Boolean(location?.trim())).length).toBeGreaterThan(0)
  })
})
