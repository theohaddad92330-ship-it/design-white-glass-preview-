import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS } from './demo-dataset'
import { seatNameOrNull } from './demo-seat-names'
import { DEMO_PERSONAL_ACCESS_PATH_SEEDS } from './demo-seed.service'

/**
 * #3403 (X68) — la CHALEUR d'une voie d'accès personnelle (« proche » /
 * « distant ») sur le client de livraison.
 *
 * Décision Louis 04/10/2026 : VIDE À DESSEIN — « décision Louis 04/10 : aucune
 * déclaration inventée sur une personne réelle ». Une chaleur se déclare sur un
 * lien avec une PERSONNE ; le client de livraison (SNCF) ne crée aucun
 * interlocuteur, et la déclarer sur une personne réelle de son dossier
 * inventerait un fait sur elle. La garde sait dire NON : une voie avec chaleur
 * sur un contact du client de livraison la fait rougir.
 */
describe('voies d’accès du client de livraison — chaleur déclarée (#3403) : vide à dessein', () => {
  const carrier = DEMO_DOSSIERS.find(d => d.account.company_name === DEMO_DELIVERY_CLIENT.account.company_name)
  // Les interlocuteurs de livraison : les SIÈGES du dossier (`roleSeat` : nom = intitulé).
  // Lot D01 (06/10/2026) : les interlocuteurs SIMULÉS (`.example`) peuvent porter une chaleur — elle est
  // déclarée sur une personne inventée, jamais sur une personne réelle. Seuls les contacts NON simulés
  // restent concernés par la règle du 04/10.
  const carrierContacts = new Set([
    ...DEMO_DELIVERY_CLIENT.contacts
      .filter(contact => !(contact.email ?? '').endsWith('.example'))
      .map(contact => contact.full_name),
    ...(carrier?.contacts ?? [])
      // Siège = nom = intitulé (agrégé) OU nom fictif de siège (décision Louis 01/11/2026, demo-seat-names).
      .filter(contact => contact.full_name === contact.title || contact.full_name === seatNameOrNull(contact.title))
      .map(contact => contact.full_name),
  ])

  it('lit un corpus NON VIDE — les voies semées et les contacts du porteur', () => {
    expect(DEMO_PERSONAL_ACCESS_PATH_SEEDS.length).toBeGreaterThan(0)
    expect(carrierContacts.size).toBeGreaterThan(0)
  })

  it('aucune voie avec chaleur ne vise un interlocuteur de livraison', () => {
    const warm = DEMO_PERSONAL_ACCESS_PATH_SEEDS.filter(
      seed => carrierContacts.has(seed.contact) && 'warmth' in seed && seed.warmth !== undefined,
    )
    expect(warm).toEqual([])
  })
})
