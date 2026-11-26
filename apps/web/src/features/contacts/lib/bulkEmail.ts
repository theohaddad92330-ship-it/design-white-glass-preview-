import { contactCoordinates } from '@bellum/contracts'

/**
 * Bulk outbound email — pure, testable helpers shared by the selection panel,
 * the confirm dialog and the mutation hook (Drive « copilote actions
 * sortantes »). No React here so the logic is unit-tested in isolation.
 */

/** Server cap on a single bulk request (`ContactsService.BULK_SEND_MAX`). We
 *  mirror it client-side to cap + warn before the request rather than letting
 *  the server silently drop the overflow. */
export const BULK_SEND_MAX = 50

/** Minimal shape the pre-flight needs — the listing projection
 *  (`ContactListItem`) only carries `email`, never the draft / sent state, so
 *  that is the only thing we can partition on client-side. Draft-missing,
 *  already-sent and opted-out contacts surface server-side in `skipped`. */
export type BulkRecipient = {
  id: string
  email: string | null
  full_name: string
}

type BulkPreflight<T extends BulkRecipient = BulkRecipient> = {
  /** Everything the user selected. */
  total: number
  /** Contacts with an address, capped to BULK_SEND_MAX — the actual recipients. */
  recipients: T[]
  /** Selected contacts with no email — excluded up-front (can't be sent). */
  withoutEmail: T[]
  /** True when more than BULK_SEND_MAX contacts have an email. */
  overCap: boolean
  /** How many addressable contacts are dropped this batch because of the cap. */
  droppedForCap: number
}

/**
 * Partition a selection into the batch we will actually send. Only contacts
 * with an email address are kept (the rest can't be sent and would just come
 * back as `no_email`), and the addressable set is capped to BULK_SEND_MAX.
 */
export function buildBulkPreflight<T extends BulkRecipient>(selected: readonly T[]): BulkPreflight<T> {
  const withoutEmail = selected.filter(contact => !hasEmail(contact))
  const addressable = selected.filter(hasEmail)
  const droppedForCap = Math.max(0, addressable.length - BULK_SEND_MAX)
  return {
    total: selected.length,
    recipients: addressable.slice(0, BULK_SEND_MAX),
    withoutEmail,
    overCap: droppedForCap > 0,
    droppedForCap,
  }
}

function hasEmail(contact: BulkRecipient): boolean {
  // #3698.7 — la même réponse que la fiche et la préparation de message.
  return contactCoordinates(contact).can_prepare_email
}
