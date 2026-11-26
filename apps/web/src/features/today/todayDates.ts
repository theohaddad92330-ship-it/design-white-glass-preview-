/**
 * Lot L-A (#4164) — les DATES de la file « Aujourd'hui ».
 *
 * Pures et sans fuseau implicite : tout se lit en heure LOCALE de
 * l'utilisateur, parce que « aujourd'hui » est le sien. Une échéance au format
 * jour (`YYYY-MM-DD`, ce que portent les relances du plan) est le jour entier ;
 * un instant ISO (étapes de séquence, appels) se range par son jour local.
 * Une échéance absente ou illisible rend `null` : on ne fabrique jamais une
 * date d'aujourd'hui (même règle que `MyRelancesList`).
 */

export type TodaySectionKey = 'overdue' | 'today' | 'week' | 'later'

/** Combien de jours après aujourd'hui « cette semaine » s'étend (demain → J+6). */
const WEEK_HORIZON_DAYS = 6

const DAY_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

const pad = (value: number): string => String(value).padStart(2, '0')

export function toLocalDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Minuit local du jour d'une échéance, ou `null` si elle est illisible. */
function dueDay(value: string): Date | null {
  const dayOnly = DAY_ONLY.exec(value)
  if (dayOnly) return new Date(Number(dayOnly[1]), Number(dayOnly[2]) - 1, Number(dayOnly[3]))
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return null
  return new Date(instant.getFullYear(), instant.getMonth(), instant.getDate())
}

function addDays(day: Date, count: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + count)
}

export function sectionOfDue(value: string | null, now: Date): TodaySectionKey | null {
  if (!value) return null
  const day = dueDay(value)
  if (!day) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (day.getTime() < today.getTime()) return 'overdue'
  if (day.getTime() === today.getTime()) return 'today'
  if (day.getTime() <= addDays(today, WEEK_HORIZON_DAYS).getTime()) return 'week'
  return 'later'
}

type PostponeChoice = { key: 'tomorrow' | 'in3days' | 'nextMonday'; date: string }

/** Les trois reports en un geste ; la date libre est un champ à part. */
export function postponeChoices(now: Date): PostponeChoice[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // Lundi suivant STRICT : un lundi, c'est dans 7 jours, jamais aujourd'hui.
  const untilMonday = (8 - today.getDay()) % 7 || 7
  return [
    { key: 'tomorrow', date: toLocalDayKey(addDays(today, 1)) },
    { key: 'in3days', date: toLocalDayKey(addDays(today, 3)) },
    { key: 'nextMonday', date: toLocalDayKey(addDays(today, untilMonday)) },
  ]
}

/** Heure de repli d'un report sur un objet qui n'avait pas d'heure (début de matinée commerciale). */
const FALLBACK_HOUR = 9

/**
 * Un jour `YYYY-MM-DD` choisi → l'instant ISO à écrire sur un objet daté à
 * l'instant : on garde l'HEURE d'origine (reporter une étape de 8 h 30 la laisse
 * à 8 h 30), 9 h à défaut.
 */
export function withDayKeepingTime(original: string | null, day: string, now: Date): string {
  const parts = DAY_ONLY.exec(day)
  if (!parts) return now.toISOString()
  const base = original ? new Date(original) : null
  const hasTime = base !== null && !Number.isNaN(base.getTime()) && !DAY_ONLY.test(original ?? '')
  const hours = hasTime ? base.getHours() : FALLBACK_HOUR
  const minutes = hasTime ? base.getMinutes() : 0
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), hours, minutes, 0, 0).toISOString()
}

/** Le jour (heure locale) d'une échéance, pour l'afficher ; `null` si absente ou illisible. */
export function dueDate(value: string | null): Date | null {
  return value ? dueDay(value) : null
}
