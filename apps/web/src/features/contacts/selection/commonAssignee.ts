import type { GlobalContact } from '@/features/contacts/hooks/useContacts'

/** Le porteur commun à toute la sélection, ou `null` dès qu'elles divergent —
 *  jamais « le premier trouvé », qui afficherait une coche mensongère. */
export function commonAssignee(contacts: readonly GlobalContact[]): string | null {
  const first = contacts[0]?.assigned_to ?? null
  if (!first) return null
  return contacts.every(contact => (contact.assigned_to ?? null) === first) ? first : null
}
