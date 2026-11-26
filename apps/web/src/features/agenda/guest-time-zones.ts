import type { AgendaEvent } from '@bellum/contracts'
import { isAllDay } from './agenda-view'

/**
 * #2390.1 / #2390.8 — L'HEURE DU RENDEZ-VOUS CHEZ L'INVITÉ.
 *
 * Aucun fournisseur d'agenda (Google, Microsoft) ne dit dans quel fuseau vit
 * un invité — inventer un fuseau depuis un pays ou un domaine violerait « jamais
 * de donnée fictive ». La SEULE source qui existe est la fiche contact du
 * compte (`contacts.timezone`), rattachée à l'invité par son e-mail exact (même
 * règle que `matchAttendeeContact`).
 *
 * Donc : fuseau connu ET différent (heure murale différente de la mienne) →
 * une ligne « chez lui, il est 08:00 ». Fuseau inconnu, invalide, identique,
 * salle réservée, aucune fiche → AUCUNE ligne (on n'affiche pas ce qu'on n'a
 * pas). Pure : le fuseau du poste et la langue viennent de l'appelant.
 */

type GuestLocalTime = {
  readonly name: string
  readonly timeZone: string
  /** L'heure chez l'invité ; précédée du jour quand il n'est pas le mien. */
  readonly time: string
}

type ContactWithZone = {
  readonly full_name: string
  readonly email: string | null
  readonly timezone?: string | null
}

function formatterFor(language: string, timeZone: string, withDay: boolean): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat(language, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      ...(withDay ? { weekday: 'short' } : {}),
    })
  } catch {
    // Fuseau que le moteur ne connaît pas : on n'en fait rien.
    return null
  }
}

function dayKey(instant: Date, timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant)
  } catch {
    return null
  }
}

export function guestLocalTimes(
  event: Pick<AgendaEvent, 'start' | 'attendees'>,
  contacts: readonly ContactWithZone[],
  viewerTimeZone: string,
  language: string,
): GuestLocalTime[] {
  if (!event.start || isAllDay(event)) return []
  const instant = new Date(event.start)
  if (Number.isNaN(instant.getTime())) return []

  const mine = formatterFor(language, viewerTimeZone, false)?.format(instant)
  const myDay = dayKey(instant, viewerTimeZone)
  const seen = new Set<string>()
  const result: GuestLocalTime[] = []

  for (const attendee of event.attendees) {
    // #2390.9 — une salle réservée n'a pas de fuseau : ce n'est pas une personne.
    if (attendee.resource === true) continue
    const email = attendee.email.trim().toLowerCase()
    if (!email || seen.has(email)) continue
    const contact = contacts.find(c => c.email?.trim().toLowerCase() === email)
    const timeZone = contact?.timezone?.trim()
    if (!contact || !timeZone) continue

    const theirDay = dayKey(instant, timeZone)
    const sameDay = theirDay !== null && theirDay === myDay
    const theirs = formatterFor(language, timeZone, !sameDay)?.format(instant)
    if (!theirs) continue
    // Même heure murale ET même jour que chez moi : rien à dire.
    const plain = formatterFor(language, timeZone, false)?.format(instant)
    if (sameDay && plain === mine) continue

    seen.add(email)
    result.push({ name: contact.full_name, timeZone, time: theirs })
  }
  return result
}
