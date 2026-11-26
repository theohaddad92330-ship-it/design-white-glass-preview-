/**
 * R22 a4 (Louis 22/10/2026) — « COORDONNÉES : DISPONIBILITÉ + ENRICHIR ».
 *
 * La recherche gratuite annonce qu'un e-mail ou un téléphone EXISTE sans le
 * livrer. Cette annonce est conservée par champ (`contacts.email_availability`
 * / `phone_availability`, migration 1796574871953) et lue ici, à UN seul
 * endroit, par toute liste ou fiche de contacts : la cellule « Coordonnées »
 * dit, par champ, connu · disponible · jamais cherché · introuvable (date).
 *
 * Doctrine : un champ connu s'affiche en clair, inchangé ; une absence n'est
 * jamais comblée ; un timeout n'est pas un échec (`unknown` ≠ `not_found`) ;
 * aucune source, aucun coût ne se nomme.
 */
import type { EnrichmentCoordinateState, EnrichmentCoordinateStateValue } from './enrichment-coordinates.js'

export const CONTACT_AVAILABILITIES = ['available', 'unknown', 'not_found'] as const
export type ContactAvailability = (typeof CONTACT_AVAILABILITIES)[number]

type AvailabilityChannel = 'email' | 'phone'

/** Le drapeau « existe » de la recherche gratuite. Faux ou absent = on ne sait pas, jamais « introuvable ». */
export function availabilityFromSourceFlag(exists: boolean | null | undefined): ContactAvailability {
  return exists === true ? 'available' : 'unknown'
}

/**
 * La disponibilité APRÈS une tentative d'enrichissement sur ce champ.
 * `not_found` seulement si une source a répondu « rien » ; une panne ou une
 * révélation en vol laisse l'annonce intacte.
 */
export function availabilityAfterSearch(
  before: ContactAvailability | null | undefined,
  outcome: EnrichmentCoordinateStateValue,
): ContactAvailability {
  if (outcome === 'found') return 'available'
  if (outcome === 'not_found') return 'not_found'
  return before ?? 'unknown'
}

type CoordinateDisplayInput = {
  email?: string | null
  phone?: string | null
  email_availability?: ContactAvailability | null
  phone_availability?: ContactAvailability | null
  enrichment_coordinates?: Partial<Record<'email' | 'phone' | 'linkedin', EnrichmentCoordinateState>> | null
}

export type CoordinateDisplay =
  | { kind: 'known'; value: string }
  | { kind: 'available' }
  | { kind: 'never_searched' }
  | { kind: 'not_found'; at: string | null }
  | { kind: 'pending' }
  | { kind: 'error' }

const present = (value: string | null | undefined): value is string => (value ?? '').trim() !== ''

export function coordinateDisplay(contact: CoordinateDisplayInput, channel: AvailabilityChannel): CoordinateDisplay {
  const value = contact[channel]
  if (present(value)) return { kind: 'known', value }
  const attempt = contact.enrichment_coordinates?.[channel]
  if (attempt?.state === 'pending') return { kind: 'pending' }
  if (attempt?.state === 'unknown') return { kind: 'error' }
  if (attempt?.state === 'not_found') return { kind: 'not_found', at: attempt.at }
  const announced = channel === 'email' ? contact.email_availability : contact.phone_availability
  if (announced === 'not_found') return { kind: 'not_found', at: null }
  if (announced === 'available') return { kind: 'available' }
  return { kind: 'never_searched' }
}

/** Ni e-mail ni téléphone : le bouton de ligne « Contacter » devient « Enrichir ». */
export function contactEnrichActionIsPrimary(contact: { email?: string | null; phone?: string | null }): boolean {
  return !present(contact.email) && !present(contact.phone)
}
