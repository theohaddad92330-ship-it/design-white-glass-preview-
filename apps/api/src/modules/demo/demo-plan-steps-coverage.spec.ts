import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4415 / #4416 (craft n°9) — la salle de démonstration montre des ÉTAPES avec destinataire et message, et un
 * contact visé par DEUX étapes (« Plan pour <prénom> » sur sa fiche).
 *
 * Retirer `SNCF5` ou `SNCF6`, ou le message LinkedIn de Younes Berrada, fait tomber ce fichier : l'écran
 * livré ne se découvrirait plus vide qu'en réunion.
 */
describe('démo — étapes du plan qui visent un contact nommé (#4415/#4416)', () => {
  const sncf = DEMO_DOSSIERS.find(dossier => dossier.account.company_name.toLowerCase().includes('sncf'))
  const actions = (sncf?.actionPlan.weeks ?? []).flatMap(week => week.actions ?? [])

  it('le dossier SNCF existe et porte un plan', () => {
    expect(sncf).toBeDefined()
    expect(actions.length).toBeGreaterThan(0)
  })

  it('deux étapes visent Younes Berrada, par un canal que sa fiche porte', () => {
    const aimed = actions.filter(action => action.contact === 'Younes Berrada')
    expect(aimed).toHaveLength(2)
    expect(aimed.every(action => action.channel === 'linkedin')).toBe(true)
  })

  it('ce contact porte le message prêt de ce canal, et son nom complet apparaît tel quel dans le plan', () => {
    const younes = sncf?.contacts.find(contact => contact.full_name === 'Younes Berrada')
    expect(younes?.linkedin_url).toBeTruthy()
    expect(younes?.linkedin_message?.trim().length).toBeGreaterThan(0)
  })
})
