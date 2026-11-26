import { seatName } from './demo-seat-names'
import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS, DEMO_OUTREACH_MESSAGES } from './demo-dataset'

/**
 * #3419.2 — « le centre d'approbation est VIDE en salle démo ».
 *
 * `DemoSeedService.seedOutreachMessages` fait `if (!contactId) continue` : un
 * message dont le contact n'est semé sous AUCUN nom disparaît SANS erreur, et le
 * centre se tait (`messages.length === 0 && calls.length === 0 → null`). Cette
 * garde lit les mêmes deux registres que `contactIds` (dossiers + client de
 * livraison) : un message orphelin, ou plus aucun message bloqué, fait échouer
 * la CI au lieu de se découvrir en réunion.
 */
const seededContactNames = new Set<string>([
  ...DEMO_DOSSIERS.flatMap(dossier => dossier.contacts.map(contact => contact.full_name)),
  ...DEMO_DELIVERY_CLIENT.contacts.map(contact => contact.full_name),
])

describe('semis des messages du centre d’approbation (#3419.2)', () => {
  it('chaque message vise un contact réellement semé — aucun `continue` silencieux', () => {
    const orphans = DEMO_OUTREACH_MESSAGES.filter(entry => !seededContactNames.has(entry.contact)).map(
      entry => entry.contact,
    )
    expect(orphans).toEqual([])
  })

  it('Directeur technique — entité numérique voyageurs (message bloqué) est semé comme contact', () => {
    expect(seededContactNames.has(seatName('Directeur technique — entité numérique voyageurs'))).toBe(true)
  })

  it('au moins un message à relire porte une affirmation sans preuve (matière du « bloqué »)', () => {
    const blockedCandidates = DEMO_OUTREACH_MESSAGES.filter(
      entry =>
        entry.contact === seatName('Directeur technique — entité numérique voyageurs') &&
        entry.status === 'needs_review',
    )
    expect(blockedCandidates.length).toBeGreaterThanOrEqual(1)
  })
})
