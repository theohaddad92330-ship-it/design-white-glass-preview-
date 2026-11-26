import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS } from './demo-dataset'
import { demoTimezone } from './demo-contact-profile'

/**
 * LA PARITÉ DÉMO DU FUSEAU PAR INVITÉ (#2390.1 / #2390.8, craft rule n°9).
 *
 * L'heure « chez l'invité » du pré-brief (`guestLocalTimes`, web) ne se lit que
 * si (1) un rendez-vous de la semaine a un invité dont l'e-mail est celui d'une
 * fiche contact et (2) cette fiche porte un fuseau DIFFÉRENT de Paris. Sans
 * cela, la ligne ne s'affiche jamais en démo (tous les contacts y vivent à
 * l'heure de Paris/Madrid) et l'écran livré se découvrirait vide en réunion.
 */
describe('parité démo — fuseau par invité', () => {
  const NOW = new Date('2026-08-18T08:00:00Z')

  // Décision Louis 04/10/2026 — le client de livraison (SNCF) ne crée AUCUN
  // interlocuteur : les fiches lues sont celles de son dossier, et aucune ne
  // porte un fuseau imposé (aucune déclaration sur une personne réelle).
  const carrier = DEMO_DOSSIERS.find(d => d.account.company_name === DEMO_DELIVERY_CLIENT.account.company_name)

  it('la garde LIT quelque chose — le dossier du client de livraison porte des contacts', () => {
    // Lot D01 (06/10/2026) : seuls des interlocuteurs SIMULÉS (`.example`) existent, sans fuseau imposé.
    for (const contact of DEMO_DELIVERY_CLIENT.contacts) {
      expect(contact.email ?? '').toMatch(/\.example$/)
      expect(contact.timezone).toBeUndefined()
    }
    expect(carrier?.contacts.length ?? 0).toBeGreaterThan(1)
  })

  it('#3420 — aucun contact du client de livraison ne porte un fuseau hors de France', () => {
    const elsewhere = (carrier?.contacts ?? []).filter(
      contact => contact.timezone && contact.timezone !== 'Europe/Paris',
    )
    expect(elsewhere).toEqual([])
  })

  it('le fuseau dérivé suit l’entité du contact : Paris sauf entité ibérique', () => {
    const lyon = { entity: 'SNCF' } as never
    const iberian = { entity: 'Banco Ibérica' } as never
    expect(demoTimezone(lyon)).toBe('Europe/Paris')
    expect(demoTimezone(iberian)).toBe('Europe/Madrid')
  })

  it('la garde sait dire NON — les contacts du dossier n’ont pas de fuseau imposé', () => {
    const withoutOverride = (carrier?.contacts ?? []).filter(contact => !contact.timezone)
    expect(withoutOverride.length).toBeGreaterThan(0)
  })
})
