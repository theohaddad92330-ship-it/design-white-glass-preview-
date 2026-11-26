import { personAttendeesOf, type AgendaEvent } from '@bellum/contracts'

/**
 * #2390.14 — « ENGAGEMENT DES INVITÉS » : l'un des critères de priorité dont la
 * DONNÉE existe (la réponse de chaque invité, `responseStatus`, rendue par
 * Google et Microsoft).
 *
 * C'est un DÉCOMPTE, jamais un classement (#2390.15) : rien ici ne dit qu'un
 * rendez-vous « prime » sur un autre. Les autres critères nommés (étape
 * commerciale, impact, deadline, relation…) n'ont pas de source sur l'évènement
 * — ils ne sont pas devinés.
 *
 * Google : accepted | declined | tentative | needsAction. Microsoft Graph :
 * accepted | declined | tentativelyAccepted | notResponded | none | organizer.
 * `organizer`/`none`/toute autre valeur ne se lit pas comme une réponse : elle
 * n'est comptée nulle part. Aucune réponse lisible ⇒ `null` (« non mesuré »),
 * jamais « 0 accepté ».
 */
type GuestResponseTally = {
  readonly accepted: number
  readonly tentative: number
  readonly declined: number
  readonly pending: number
}

export function guestResponseTally(event: Pick<AgendaEvent, 'attendees'>): GuestResponseTally | null {
  const tally = { accepted: 0, tentative: 0, declined: 0, pending: 0 }
  let read = 0
  for (const attendee of personAttendeesOf(event)) {
    switch (attendee.responseStatus) {
      case 'accepted':
        tally.accepted += 1
        break
      case 'tentative':
      case 'tentativelyAccepted':
        tally.tentative += 1
        break
      case 'declined':
        tally.declined += 1
        break
      case 'needsAction':
      case 'notResponded':
        tally.pending += 1
        break
      default:
        continue
    }
    read += 1
  }
  return read === 0 ? null : tally
}
