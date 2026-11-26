import type { AgendaConflict } from '@bellum/contracts'

/**
 * DES OPTIONS CONCRÈTES POUR UN CHEVAUCHEMENT — #2390.11 / #2390.12
 * (LAU-FINAL-104).
 *
 * `agendaConflictSchema` (`detectConflicts`, `free-slots.ts`) dit QUE deux
 * rendez-vous se chevauchent ; rien n'en tirait de résolution. Ces trois
 * options sont les seules calculables SANS RIEN INVENTER — uniquement à
 * partir des horaires déjà connus des deux évènements, jamais une durée de
 * trajet, une salle ou une disponibilité qui n'existe nulle part dans ce
 * dépôt (doctrine « jamais de donnée fictive »). « Déléguer » reste hors de
 * cette fonction : choisir un délégataire est une décision produit que rien
 * ici ne permet de prendre à la place de l'utilisateur.
 *
 * #2390.12 (28/09/2026) — LE BATTEMENT (BUFFER), TOUJOURS CHOISI, JAMAIS
 * CALCULÉ. La DURÉE du battement reste une décision produit (même raison que
 * « déléguer ») : cette fonction ne l'invente jamais. `bufferMinutes` en
 * second argument est la liste des battements CONCRETS que l'écran propose
 * au clic (des choix, pas un champ libre deviné) — absent, le comportement
 * reste byte-identique à avant ce lot (aucune option `moveSecondWithBuffer`).
 */
type ConflictResolutionKind = 'moveFirst' | 'moveSecond' | 'shortenFirst' | 'moveSecondWithBuffer'

export type ConflictResolutionOption =
  | {
      kind: 'moveFirst' | 'moveSecond' | 'shortenFirst'
      /** L'évènement que CETTE option modifie — jamais l'autre. */
      eventId: string
      startsAt: string
      endsAt: string
    }
  | {
      kind: 'moveSecondWithBuffer'
      eventId: string
      startsAt: string
      endsAt: string
      /** Le battement CHOISI par l'utilisateur (jamais calculé ici). */
      bufferMinutes: number
    }

/**
 * `detectConflicts` garantit `first` trié avant `second`
 * (`first.start <= second.start`) et un chevauchement réel
 * (`second.start < first.end`) — cette fonction s'appuie sur cette garantie
 * plutôt que de la redémontrer, mais reste défensive sur les horaires
 * manquants ou incohérents (jamais une heure devinée).
 */
export function resolveOverlap(
  conflict: AgendaConflict,
  options_: { bufferMinutes?: readonly number[] } = {},
): ConflictResolutionOption[] {
  const { first, second } = conflict
  if (!first.start || !first.end || !second.start || !second.end) return []

  const firstStart = Date.parse(first.start)
  const firstEnd = Date.parse(first.end)
  const secondStart = Date.parse(second.start)
  const secondEnd = Date.parse(second.end)
  if (![firstStart, firstEnd, secondStart, secondEnd].every(Number.isFinite)) return []

  const firstDuration = firstEnd - firstStart
  const secondDuration = secondEnd - secondStart
  if (firstDuration <= 0 || secondDuration <= 0) return []

  const options: ConflictResolutionOption[] = [
    // Décaler le second juste après la fin du premier : sa durée ne change pas.
    {
      kind: 'moveSecond',
      eventId: second.id,
      startsAt: new Date(firstEnd).toISOString(),
      endsAt: new Date(firstEnd + secondDuration).toISOString(),
    },
    // Décaler le premier juste après la fin du second : sa durée ne change pas.
    {
      kind: 'moveFirst',
      eventId: first.id,
      startsAt: new Date(secondEnd).toISOString(),
      endsAt: new Date(secondEnd + firstDuration).toISOString(),
    },
  ]

  // Raccourcir le premier jusqu'au début du second : seulement quand ça laisse
  // une vraie réunion (le premier commence bien avant le second) et ne coupe
  // pas le second en deux morceaux (le premier ne le dépasse pas) — sinon ce
  // ne serait plus « raccourcir », mais inventer une troisième réunion pour la
  // partie du second qui suivrait la fin du premier.
  if (firstStart < secondStart && firstEnd <= secondEnd) {
    options.push({ kind: 'shortenFirst', eventId: first.id, startsAt: first.start, endsAt: second.start })
  }

  // #2390.12 — le second, décalé après la fin du premier PLUS un battement
  // CHOISI (jamais calculé ici, voir le docblock) : une valeur nulle ou
  // négative ne serait pas un battement.
  for (const bufferMinutes of options_.bufferMinutes ?? []) {
    if (!Number.isFinite(bufferMinutes) || bufferMinutes <= 0) continue
    const bufferedStart = firstEnd + bufferMinutes * 60_000
    options.push({
      kind: 'moveSecondWithBuffer',
      eventId: second.id,
      bufferMinutes,
      startsAt: new Date(bufferedStart).toISOString(),
      endsAt: new Date(bufferedStart + secondDuration).toISOString(),
    })
  }

  return options
}
