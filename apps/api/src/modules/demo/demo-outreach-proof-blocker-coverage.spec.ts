import { outreachContentBlockers } from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS, DEMO_OUTREACH_MESSAGES } from './demo-dataset'

/**
 * #3420 (lot X62, recette prod 02/10) — « Il manque une preuve » ABSENT EN DÉMO.
 *
 * La salle montrait déjà trois bloquants (relation non vérifiée, rendez-vous
 * imposé, technologie affirmée), mais JAMAIS le motif le plus simple du retour :
 * un fait affirmé sans preuve (`unverifiable_claim`). Le recetteur ne pouvait
 * donc pas rejouer le cas. Cette garde SAIT DIRE NON : elle rougit si plus aucun
 * message « à relire » de la salle ne porte ce motif, ou si son contact sort des
 * dossiers seedés (un message sans destinataire n'est jamais écrit au semis).
 */
describe('messages de démo — le bloquant « Il manque une preuve » est jouable (#3420)', () => {
  const contactNames = new Set([
    ...DEMO_DOSSIERS.flatMap(dossier => dossier.contacts.map(contact => contact.full_name)),
    ...DEMO_DELIVERY_CLIENT.contacts.map(contact => contact.full_name),
  ])

  const unproven = DEMO_OUTREACH_MESSAGES.filter(
    entry =>
      entry.status === 'needs_review' &&
      outreachContentBlockers({
        body: entry.edit?.body ?? entry.body,
        accountName: null,
        contactName: entry.contact,
      }).includes('unverifiable_claim'),
  )

  it('au moins un message à relire est bloqué pour « Il manque une preuve »', () => {
    expect(unproven.length).toBeGreaterThanOrEqual(1)
  })

  it('son destinataire est un contact seedé — le semis ne l’ignore pas', () => {
    for (const entry of unproven) expect(contactNames.has(entry.contact)).toBe(true)
  })

  it('il ne part pas : jamais « approuvé » ni « envoyé »', () => {
    for (const entry of unproven) expect(entry.status).toBe('needs_review')
  })

  // #3420.1 (recette démo 05/10) — « À valider » attendu, 3 lignes « bloquées » vues : la salle doit
  // aussi porter un message à relire SANS bloquant de contenu (Lorenzo Bini Smaghi), que
  // `OutreachQueuePreview` classe en tête sous « À valider ».
  it('#3420.1 au moins un message à relire n’a aucun bloquant de contenu (vue « À valider »)', () => {
    const clean = DEMO_OUTREACH_MESSAGES.filter(
      entry =>
        entry.status === 'needs_review' &&
        outreachContentBlockers({
          body: entry.edit?.body ?? entry.body,
          accountName: null,
          contactName: entry.contact,
        }).length === 0,
    )
    expect(clean.map(entry => entry.contact)).toContain('Lorenzo Bini Smaghi')
  })
})
