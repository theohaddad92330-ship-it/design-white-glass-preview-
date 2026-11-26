import { templateReadiness } from '@bellum/contracts'
import { demoContactSignals } from './demo-contact-profile'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3417 (recette prod 02/10, Y14) — « Texte inséré vs source non rejoué (aucun contact avec signal
 * accessible) ». Le modèle approuvé « Approche froide » exige la preuve `recent_signal`, lue sur les
 * signaux RATTACHÉS AU CONTACT (`contacts.signals`). La salle doit montrer les DEUX états :
 *  - un contact DATÉ de signaux → le modèle est PRÊT, son texte est rendu ;
 *  - un contact « à qualifier » (Camille Roussel, sans compte) → bloqué, « il manque : un signal récent ».
 * Cette garde lit le vrai semis (`DEMO_DOSSIERS` + `demoContactSignals`), pas un commentaire.
 */
describe('couverture démo — modèle approuvé prêt ET bloqué (#3417)', () => {
  const coldApproach = { requiredEvidence: ['recent_signal'] }

  it('au moins un contact de la salle porte un signal DATÉ : « Approche froide » est prête pour lui', () => {
    const ready = DEMO_DOSSIERS.flatMap(dossier =>
      dossier.contacts
        .map(contact => ({
          contact: contact.full_name,
          signals: demoContactSignals(
            {
              full_name: contact.full_name,
              title: contact.title,
              entity: contact.entity,
              family: contact.family,
              decision_role: contact.decision_role,
              priority: contact.priority,
              seniority: '',
              key_points: [],
              why_contact: contact.why_contact,
            },
            {
              company_name: dossier.account.company_name,
              sector: '',
              headquarters: '',
              recent_signals: dossier.account.recent_signals,
            },
          ),
        }))
        .filter(({ signals }) => signals.length > 0 && signals.some(signal => signal.date)),
    )
    expect(ready.length).toBeGreaterThan(0)
    expect(templateReadiness(coldApproach, new Set(['recent_signal']))).toEqual({ ready: true })
  })

  it('témoin — sans signal rattaché, le même modèle est bloqué et nomme ce qui manque', () => {
    expect(templateReadiness(coldApproach, new Set())).toEqual({
      ready: false,
      missingEvidence: ['recent_signal'],
    })
  })
})
