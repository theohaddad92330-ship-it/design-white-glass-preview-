import { committeeSeatsHeldByContact } from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * #4324.1 (craft rule n°9) — la salle de démo MONTRE le cas de Julien Seigneur : un titulaire du siège technique
 * rangé « À qualifier » (`unknown`) ne laisse pas la place « à pourvoir ».
 *
 * Mutations : repasser Élise Varennes en `technical` → la 2e assertion rougit (la démo ne montre plus le cas) ;
 * poser un `technical` sur un autre contact du compte → idem (le siège serait tenu pour une autre raison).
 */
describe('démo — un siège tenu par un contact « à qualifier » (#4324.1)', () => {
  const contacts = DEMO_DELIVERY_CLIENT.contacts

  it('un contact « à qualifier » tient le siège technique par son seul intitulé', () => {
    const held = contacts.filter(
      contact => contact.decision_role === 'unknown' && committeeSeatsHeldByContact(contact).includes('technical'),
    )
    expect(held.map(contact => contact.full_name)).toEqual(['Élise Varennes'])
  })

  it('SAIT DIRE NON : aucun autre contact du compte ne pose le rôle technique', () => {
    expect(contacts.filter(contact => contact.decision_role === 'technical')).toEqual([])
  })
})
