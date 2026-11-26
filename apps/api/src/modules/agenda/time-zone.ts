/**
 * Conversion heure locale ↔ instant, sans dépendance.
 *
 * Le besoin est étroit et parfaitement servi par `Intl` : savoir quel jour et
 * quelle heure il est à Paris pour un instant donné, et retrouver l'instant qui
 * correspond à « lundi 9 h 00 à Paris ». Ajouter une bibliothèque de dates pour
 * ça alourdirait l'image d'un service qui en fait déjà beaucoup.
 *
 * Toutes les heures ouvrées manipulées ici (9 h, 18 h) sont loin des bascules
 * d'heure d'été, qui se produisent vers 2-3 h du matin. Une seule passe de
 * correction d'offset suffit donc ; le cas pathologique — une heure ouvrée
 * placée pile dans l'heure qui n'existe pas au passage à l'heure d'été — ne peut
 * pas se produire avec des bornes de journée de travail.
 */

/** Décalage du fuseau `timeZone` par rapport à UTC, en millisecondes, à cet instant. */
export function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]))
  const asIfUtc = Date.UTC(
    Number(parts['year']),
    Number(parts['month']) - 1,
    Number(parts['day']),
    // `hour12: false` peut rendre « 24 » pour minuit selon la plateforme.
    Number(parts['hour']) % 24,
    Number(parts['minute']),
    Number(parts['second']),
  )
  return asIfUtc - instant.getTime()
}

/** Les composantes calendaires d'un instant, lues dans `timeZone`. */
type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  /** Jour de la semaine ISO-8601 : 1 = lundi … 7 = dimanche. */
  isoWeekday: number
}

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  })
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]))
  const weekdayIndex: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return {
    year: Number(parts['year']),
    month: Number(parts['month']),
    day: Number(parts['day']),
    hour: Number(parts['hour']) % 24,
    minute: Number(parts['minute']),
    isoWeekday: weekdayIndex[String(parts['weekday'])] ?? 1,
  }
}

/** L'instant correspondant à une heure murale dans `timeZone`. */
export function zonedTimeToInstant(
  wall: { year: number; month: number; day: number; hour: number; minute?: number },
  timeZone: string,
): Date {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute ?? 0)
  const offset = timeZoneOffsetMs(new Date(naive), timeZone)
  return new Date(naive - offset)
}

/** Le jour calendaire (`YYYY-MM-DD`) d'un instant, lu dans `timeZone`. */
export function zonedDateKey(instant: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(instant, timeZone)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
