/**
 * SYNC-C.6 — « Synchronisé il y a 6 min » / « Prochaine synchro dans 9 min ».
 *
 * Une seule date de synchro par carte, dite en relatif tant qu'elle est récente : la synchro tourne toutes les
 * quelques minutes, une date absolue « 19 oct. 14:32 » ne dit pas si elle est à jour. Au-delà de 24 h, la date
 * absolue reprend (une synchro d'hier n'est pas « il y a 31 h »).
 */
type Lang = string

type SyncAgo = { kind: 'now' } | { kind: 'ago'; text: string } | { kind: 'date'; text: string }
type SyncIn = { kind: 'soon' } | { kind: 'in'; text: string }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function relative(lang: Lang, value: number, unit: 'minute' | 'hour' | 'day'): string {
  return new Intl.RelativeTimeFormat(lang, { numeric: 'always', style: 'short' }).format(value, unit)
}

/** `null` pour une date illisible : jamais « à l'instant » (recette 21/10 K2). */
export function syncAgo(iso: string, now: Date, lang: Lang): SyncAgo | null {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return null
  const elapsed = now.getTime() - at
  if (elapsed < MINUTE) return { kind: 'now' }
  if (elapsed < HOUR) return { kind: 'ago', text: relative(lang, -Math.round(elapsed / MINUTE), 'minute') }
  if (elapsed < DAY) return { kind: 'ago', text: relative(lang, -Math.round(elapsed / HOUR), 'hour') }
  return { kind: 'date', text: new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(at) }
}

/**
 * #4290.2 — le RELATIF d'une synchro passée, SANS seuil : « il y a 7 min », « il y a 3 j ». Il accompagne toujours la
 * date absolue (une seule formulation pour tous les CRM) ; `null` pour une date illisible ou future.
 */
export function syncElapsed(iso: string, now: Date, lang: Lang): SyncAgo | null {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return null
  const elapsed = now.getTime() - at
  if (elapsed < 0) return null
  if (elapsed < MINUTE) return { kind: 'now' }
  if (elapsed < HOUR) return { kind: 'ago', text: relative(lang, -Math.round(elapsed / MINUTE), 'minute') }
  if (elapsed < DAY) return { kind: 'ago', text: relative(lang, -Math.round(elapsed / HOUR), 'hour') }
  return { kind: 'ago', text: relative(lang, -Math.round(elapsed / DAY), 'day') }
}

export function syncIn(iso: string, now: Date, lang: Lang): SyncIn {
  const at = Date.parse(iso)
  const remaining = at - now.getTime()
  if (Number.isNaN(at) || remaining < MINUTE) return { kind: 'soon' }
  if (remaining < HOUR) return { kind: 'in', text: relative(lang, Math.round(remaining / MINUTE), 'minute') }
  if (remaining < DAY) return { kind: 'in', text: relative(lang, Math.round(remaining / HOUR), 'hour') }
  return { kind: 'in', text: relative(lang, Math.round(remaining / DAY), 'day') }
}
