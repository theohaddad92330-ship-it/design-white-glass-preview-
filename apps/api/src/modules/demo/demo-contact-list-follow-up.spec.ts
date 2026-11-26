import { DEMO_OUTREACH_MESSAGES } from './demo-dataset'

/**
 * #3894 — relance dans contact_list (Louis 16/10). La carte contacts de Laura lit la relance de chaque personne dans
 * `outreach_messages` (IA : `ownership.fetch_follow_ups_by_contact`) : en démo il n'y a RIEN de plus à semer, mais
 * il faut qu'une personne du jeu porte une relance PRÉPARÉE (`needs_review`/`approved`), sinon la ligne n'apparaît
 * jamais devant un prospect. `copied_manual` ne compte pas (ni envoi ni préparation). Aucun message « envoyé » n'est
 * semé : la démo montre « Relance préparée », jamais un envoi inventé.
 */
const PREPARED = ['drafted', 'needs_review', 'approved', 'scheduled']

describe('#3894 — la relance par contact est visible en démonstration', () => {
  it('au moins deux personnes distinctes portent une relance préparée', () => {
    const contacts = new Set(DEMO_OUTREACH_MESSAGES.filter(m => PREPARED.includes(m.status)).map(m => m.contact))
    expect(contacts.size).toBeGreaterThanOrEqual(2)
  })

  it('la garde sait dire NON : un jeu sans message préparé ne passe pas', () => {
    const none = DEMO_OUTREACH_MESSAGES.filter(m => m.status === 'copied_manual')
    expect(none.filter(m => PREPARED.includes(m.status))).toHaveLength(0)
  })
})
