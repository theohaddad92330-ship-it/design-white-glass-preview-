import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4042 — la revue de l'envoi groupé (« Relire les e-mails avant l'envoi »)
 * montre, pour chaque personne sélectionnée, SON mail préparé. Le lien de
 * démonstration doit donc porter des personnes joignables avec un mail déjà
 * préparé : sans elles la revue s'ouvrirait sur « aucun mail préparé » devant
 * un prospect. Le dialogue ne fait rien partir en démo (`demo_send_blocked`).
 */
describe('démo — contacts avec un mail préparé (revue de l’envoi groupé, #4042)', () => {
  const prepared = DEMO_DOSSIERS.flatMap(dossier => dossier.contacts).filter(
    contact => Boolean(contact.email) && Boolean(contact.email_message?.body?.trim()),
  )

  it('sème au moins trois personnes avec une adresse ET un mail préparé', () => {
    expect(prepared.length).toBeGreaterThanOrEqual(3)
  })

  it('chaque mail préparé a un objet et un texte', () => {
    for (const contact of prepared) {
      expect(contact.email_message?.subject.trim()).toBeTruthy()
      expect(contact.email_message?.body.trim()).toBeTruthy()
    }
  })
})
