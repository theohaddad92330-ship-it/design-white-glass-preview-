import type { Contact } from '@bellum/contracts'

/**
 * LUDOVIC-E LC.1 — où travaille le contact, quand on le sait : `location` (saisie / enrichie), à défaut
 * la ville et le pays LUS à la collecte (`place`). Absent ⇒ `null` : on n'affiche pas ce qu'on n'a pas, et
 * on ne devine jamais un lieu (l'ORDRE par zone vit côté API, `contact-seller-focus.ts` ; ceci ne fait que
 * le rendre vérifiable à l'écran).
 */
export function contactPlaceLabel(contact: Pick<Contact, 'location' | 'place'>): string | null {
  const location = contact.location?.trim()
  if (location) return location
  const parts = [contact.place?.city, contact.place?.country]
    .map(part => part?.trim())
    .filter((part): part is string => !!part)
  return parts.length > 0 ? parts.join(', ') : null
}
