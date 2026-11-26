import { availabilityAfterSearch, availabilityFromSourceFlag } from '@bellum/contracts'
import type { ContactAvailability, EnrichmentCoordinateStates } from '@bellum/contracts'

/**
 * R22 a4 — l'écriture de `contacts.email_availability` / `phone_availability`.
 * Trois moments : la création depuis une recherche (le drapeau « existe »), la
 * fusion d'une collecte ultérieure (on monte, on ne dégrade jamais) et la fin
 * d'une tentative d'enrichissement (un verdict `not_found` ou `found`).
 */
type AvailabilityColumns = {
  email_availability: ContactAvailability | null
  phone_availability: ContactAvailability | null
}

const isUnsettled = (value: ContactAvailability | null): boolean => value === null || value === 'unknown'

export function seedCoordinateAvailability(seed: {
  apolloDetails?: { hasEmail?: boolean; hasPhone?: boolean } | null
}): AvailabilityColumns {
  const details = seed.apolloDetails
  if (!details) return { email_availability: null, phone_availability: null }
  return {
    email_availability: availabilityFromSourceFlag(details.hasEmail),
    phone_availability: availabilityFromSourceFlag(details.hasPhone),
  }
}

/** Ce qu'une collecte plus récente ajoute : `available` sur un champ NULL/unknown. Un `not_found` est un verdict de recherche, il ne rebascule pas. */
export function mergeSeedAvailability(
  row: AvailabilityColumns,
  incoming: AvailabilityColumns,
): Partial<AvailabilityColumns> {
  const patch: Partial<AvailabilityColumns> = {}
  if (incoming.email_availability === 'available' && isUnsettled(row.email_availability)) {
    patch.email_availability = 'available'
  }
  if (incoming.phone_availability === 'available' && isUnsettled(row.phone_availability)) {
    patch.phone_availability = 'available'
  }
  return patch
}

/** Après une tentative : un champ change seulement s'il a un verdict (`found` / `not_found`). */
export function availabilityPatchAfterSearch(
  row: AvailabilityColumns,
  coordinates: EnrichmentCoordinateStates,
): Partial<AvailabilityColumns> {
  const patch: Partial<AvailabilityColumns> = {}
  for (const channel of ['email', 'phone'] as const) {
    const state = coordinates[channel]?.state
    if (state !== 'found' && state !== 'not_found') continue
    const column = `${channel}_availability` as const
    const next = availabilityAfterSearch(row[column], state)
    if (next !== row[column]) patch[column] = next
  }
  return patch
}
