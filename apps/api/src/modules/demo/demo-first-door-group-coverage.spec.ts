import { DEMO_FIRST_DOOR_GROUP_COVERAGE } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS } from './demo-dataset'

/**
 * #2295.4bis — le groupe « première porte » en démonstration.
 *
 * Décision Louis 04/10/2026 : VIDE À DESSEIN — « aucune déclaration inventée
 * sur une personne réelle ». Le verdict « c'est par elle qu'on entre » se pose
 * sur une PERSONNE nommée ; le client de livraison (SNCF) ne crée aucun
 * interlocuteur. Cette garde sait dire NON : un `demo_seed_first_door` posé sur
 * un contact du client de livraison la fait rougir.
 */
describe('#2295.4bis — le groupe « première porte » en démonstration', () => {
  it('DEMO_FIRST_DOOR_GROUP_COVERAGE est classée VIDE À DESSEIN, avec la raison imposée', () => {
    expect(DEMO_FIRST_DOOR_GROUP_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_FIRST_DOOR_GROUP_COVERAGE.reason).toContain(
      'décision Louis 04/10 : aucune déclaration inventée sur une personne réelle',
    )
  })

  it('aucun contact du client de livraison ne porte `demo_seed_first_door`', () => {
    const carrier = DEMO_DOSSIERS.find(d => d.account.company_name === DEMO_DELIVERY_CLIENT.account.company_name)
    expect(carrier?.contacts.length ?? 0).toBeGreaterThan(0)
    // Lot D01 (06/10/2026) : les interlocuteurs SIMULÉS du client de livraison sont inclus — aucun n'est « première porte ».
    const flagged = [...DEMO_DELIVERY_CLIENT.contacts, ...(carrier?.contacts ?? [])].filter(
      contact => contact.demo_seed_first_door === true,
    )
    expect(flagged).toEqual([])
  })
})
