import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * #3712 (épopée #4035) — la fiche Contact montre un projet à l'étape « Détecté » : un contact de la salle est
 * rattaché (par identité, `project_contacts`) à un projet dont l'étape est `detected`. Sans lui, la ligne
 * « Détecté » de « Dossiers associés » ne se voyait jamais en démo (recette 08/10). Contact RÉEL de la salle
 * (SNCF), jamais un compte fictif.
 */
const cases = DEMO_DELIVERY_CLIENT.importedProjects
const sncfContacts = DEMO_DELIVERY_CLIENT.contacts.map(c => c.full_name)

describe('#3712 — cas « Détecté » sur une fiche contact', () => {
  const detectedWithContact = cases.filter(c => c.stage === 'detected' && (c.contacts?.length ?? 0) > 0)

  it('au moins un projet « detected » a un contact rattaché', () => {
    expect(detectedWithContact.length).toBeGreaterThanOrEqual(1)
  })

  it('chaque contact rattaché existe dans le client de livraison SNCF semé (rattachement par identité, rien de fabriqué)', () => {
    for (const c of detectedWithContact) {
      for (const link of c.contacts ?? []) expect(sncfContacts).toContain(link.full_name)
    }
  })

  it('sait dire NON : les idées détectées du compte restent SANS interlocuteur (garde #3624)', () => {
    const ideas = DEMO_DELIVERY_CLIENT.signalsAndNeedsCases.filter(c => c.stage === 'detected')
    expect(ideas.length).toBeGreaterThan(0)
    for (const idea of ideas) expect(idea.contacts ?? []).toEqual([])
  })
})
