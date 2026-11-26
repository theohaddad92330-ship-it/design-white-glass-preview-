import { personAttendeesOf, type AgendaEvent } from '@bellum/contracts'

/**
 * Traduire un geste de souris en un nouvel horaire.
 *
 * Le calcul est ici, pur et testé, parce que le geste est le seul de l'agenda
 * qui MODIFIE quelque chose que d'autres personnes ont déjà : une erreur d'un
 * quart d'heure part chez tous les invités, et se répare en les prévenant une
 * seconde fois.
 */

/**
 * Pas d'aimantation, en minutes.
 *
 * Un agenda ne se déplace pas à la minute près : personne ne fixe une réunion
 * à 14 h 07, et un geste à la souris n'a pas cette précision de toute façon.
 * Aimanter au quart d'heure rend le résultat prévisible — on lâche « vers 15 h »
 * et on obtient 15 h — au lieu de dépendre du pixel exact où le doigt s'est levé.
 */
export const SNAP_MINUTES = 15

/** Durée minimale d'un rendez-vous étiré. En deçà, le bloc devient un trait. */
export const MIN_DURATION_MINUTES = 15

export type DragMode = 'move' | 'resize-end'

export type DragProposal = {
  startMinutes: number
  endMinutes: number
  /** Théo A today-agenda.A2 — jour choisi dans la modale (`YYYY-MM-DD`) ; absent = jour de l'évènement. */
  date?: string
}

/** Arrondit au pas d'aimantation le plus proche. */
function snap(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
}

/**
 * Le nouvel horaire proposé par un geste.
 *
 * `deltaMinutes` est le déplacement vertical converti en minutes. Le résultat
 * est BORNÉ à la fenêtre affichée : un rendez-vous tiré au-delà du haut de la
 * grille ne doit pas atterrir à 3 h du matin, heure que l'utilisateur n'a même
 * pas sous les yeux au moment où il lâche.
 */
export function proposeDrag(
  original: { startMinutes: number; endMinutes: number },
  mode: DragMode,
  deltaMinutes: number,
  bounds: { fromMinutes: number; toMinutes: number },
): DragProposal {
  const duration = original.endMinutes - original.startMinutes

  if (mode === 'resize-end') {
    // Étirer ne déplace jamais le début : on tire le bas, l'heure de rendez-vous
    // reste celle que les invités ont notée.
    const rawEnd = snap(original.endMinutes + deltaMinutes)
    const end = Math.min(Math.max(rawEnd, original.startMinutes + MIN_DURATION_MINUTES), bounds.toMinutes)
    return { startMinutes: original.startMinutes, endMinutes: end }
  }

  // Déplacer conserve la durée : c'est la promesse du geste. La borne s'applique
  // au COUPLE, sinon un rendez-vous poussé vers le bas verrait sa fin rabotée et
  // raccourcirait la réunion sans que personne ne l'ait demandé.
  const rawStart = snap(original.startMinutes + deltaMinutes)
  const start = Math.min(Math.max(rawStart, bounds.fromMinutes), bounds.toMinutes - duration)
  return { startMinutes: start, endMinutes: start + duration }
}

/** Le geste change-t-il réellement quelque chose ? */
export function isNoopDrag(original: { startMinutes: number; endMinutes: number }, next: DragProposal): boolean {
  return original.startMinutes === next.startMinutes && original.endMinutes === next.endMinutes
}

/**
 * Les bornes ISO correspondant à une proposition, sur le jour de l'évènement.
 *
 * Le jour vient de l'évènement ORIGINAL et non de la date du jour : on peut
 * regarder l'agenda de demain, et un rendez-vous déplacé doit rester le sien.
 */
export function toIsoRange(event: AgendaEvent, proposal: DragProposal): { startsAt: string; endsAt: string } | null {
  if (!event.start) return null
  const origin = new Date(event.start)
  if (Number.isNaN(origin.getTime())) return null
  const chosen = proposal.date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(proposal.date) : null
  const base = chosen ? new Date(Number(chosen[1]), Number(chosen[2]) - 1, Number(chosen[3])) : origin
  if (Number.isNaN(base.getTime())) return null
  const at = (minutes: number) =>
    new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(minutes / 60), minutes % 60).toISOString()
  return { startsAt: at(proposal.startMinutes), endsAt: at(proposal.endMinutes) }
}

/**
 * Combien de personnes recevront la notification, en dehors de l'organisateur.
 *
 * #2390.9 — une salle réservée (`attendee.resource`) reste sur la liste des
 * invités côté fournisseur, mais ce n'est pas une PERSONNE à prévenir :
 * `personAttendeesOf` est la source unique de cette exclusion (GA-26).
 */
export function guestCount(event: AgendaEvent): { total: number; external: number } {
  const attendees = personAttendeesOf(event)
  return { total: attendees.length, external: attendees.filter(attendee => attendee.external).length }
}

/**
 * #2938 — la PROPOSITION par défaut de « Déplacer » depuis un conflit
 * d'agenda : `event` glisse pour démarrer juste après la FIN de `other`, sa
 * durée conservée — la même promesse que `proposeDrag('move', …)`, sans geste
 * de souris pour la porter.
 *
 * Rendue en minutes-de-JOURNÉE (comme `DragProposal`) : `toIsoRange` rejoue
 * ensuite ces minutes sur le jour de DÉPART d'`event`, jamais celui d'`other`
 * — sans conséquence ici, deux rendez-vous en CONFLIT partagent par
 * construction le même jour. `RescheduleDialog` reste la SEULE porte
 * d'écriture — cette fonction ne fait que proposer, elle n'appelle jamais
 * `rescheduleEvent`.
 *
 * `null` quand rien n'est exploitable : sans date de fin sur l'un des deux
 * rendez-vous, il n'y a pas de « juste après » à calculer — deviner un horaire
 * serait inventer une donnée, ce que le dépôt s'interdit.
 */
export function proposeMoveAfter(event: AgendaEvent, other: AgendaEvent): DragProposal | null {
  if (!event.start || !event.end || !other.end) return null
  const duration = (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000
  if (!Number.isFinite(duration) || duration <= 0) return null
  const otherEnd = new Date(other.end)
  if (Number.isNaN(otherEnd.getTime())) return null
  const startMinutes = otherEnd.getHours() * 60 + otherEnd.getMinutes()
  return { startMinutes, endMinutes: startMinutes + duration }
}

/**
 * #2938 — le créneau HORS GRILLE : `RescheduleDialog` ouvre depuis un conflit
 * (`ConflictDialog`) sans grille calendrier sous les yeux — la proposition par
 * défaut de `proposeMoveAfter` ne peut donc s'ajuster qu'en TAPANT une heure,
 * jamais en glissant. Même promesse que `proposeDrag('move', …)` : la durée ne
 * bouge JAMAIS, seul le départ se déplace. Bornée au jour (0-1439 minutes) :
 * un déplacement qui changerait de jour est un autre geste que celui-ci, pas
 * une extension de ce champ.
 */
export function withStartMinutes(proposal: DragProposal, startMinutes: number): DragProposal {
  const duration = proposal.endMinutes - proposal.startMinutes
  const start = Math.min(Math.max(Math.round(startMinutes), 0), 24 * 60 - duration)
  return { ...(proposal.date ? { date: proposal.date } : {}), startMinutes: start, endMinutes: start + duration }
}

/**
 * #2938 — l'heure d'une proposition, au format qu'attend un `<input
 * type="time">` (`HH:MM`, zéro devant).
 */
export function proposalTimeInputValue(minutes: number): string {
  const clamped = Math.min(Math.max(Math.round(minutes), 0), 24 * 60)
  const hours = Math.floor(clamped / 60)
  const mins = clamped % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

/**
 * #2938 — l'inverse : ce qu'un `<input type="time">` rend (`HH:MM`, parfois
 * vide pendant la saisie) traduit en minutes-de-journée. `null` sur tout ce
 * qui n'est pas une heure lisible — on ne devine jamais un horaire à partir
 * d'une saisie incomplète.
 */
export function parseTimeInputValue(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}
