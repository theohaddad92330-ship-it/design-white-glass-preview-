/**
 * Les dates de la mémoire de Laura, écrites UNE fois (GA-26) : l'échéance que
 * la carte Mémoire pose à l'épinglage et celle que Réglages › Mémoire pose après
 * coup (#1916.22) sont la même règle — deux copies dériveraient.
 */

/**
 * `YYYY-MM-DD` (champ date) → ISO à la FIN de la journée choisie, en UTC :
 * « valable jusqu'au 31 août » veut dire que le 31 août compte encore. Saisie
 * vide ou illisible ⇒ `null` : pas d'échéance plutôt qu'une date devinée.
 */
export function endOfDayIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const ms = Date.parse(`${value}T23:59:59.999Z`)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/** ISO → `YYYY-MM-DD` du jour UTC, pour pré-remplir un champ date ; `''` sans date lisible. */
export function dateInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : ''
}

/**
 * ISO → date courte localisée (« 31 août 2026 »). `null` si absente ou
 * illisible : jamais « Invalid Date », jamais une date devinée.
 *
 * `utc` pour une ÉCHÉANCE : elle est posée à la fin du jour UTC choisi
 * ({@link endOfDayIso}) ; lue dans le fuseau du navigateur, « jusqu'au 31 août »
 * s'afficherait « 1 sept. » à Paris.
 */
export function formatMemoryDate(
  iso: string | null | undefined,
  language: string,
  options: { utc?: boolean } = {},
): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB'
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(options.utc ? { timeZone: 'UTC' } : {}),
  }).format(date)
}

/**
 * #1917.6 — LES DURÉES PROPOSÉES À L'ÉPINGLAGE, et rien d'autre.
 *
 * « Sans échéance » d'abord : c'est ce que faisait tout épinglage avant ce lot,
 * et c'est ce qu'on continue de proposer par défaut — une mémoire ne se périme
 * pas parce qu'un écran a ajouté un choix.
 */
export const MEMORY_DURATIONS = ['none', 'days30', 'months3', 'months12'] as const
export type MemoryDuration = (typeof MEMORY_DURATIONS)[number]

/** Combien de JOURS chaque durée vaut. `none` n'y figure pas : elle n'a pas de fin. */
const DURATION_DAYS: Record<Exclude<MemoryDuration, 'none'>, number> = {
  days30: 30,
  months3: 91,
  months12: 365,
}

/**
 * Une durée choisie → l'ISO d'échéance, à la FIN du jour atteint (la même règle
 * que {@link endOfDayIso} : « valable 30 jours » veut dire que le 30e jour
 * compte encore). `none` ⇒ `null`, jamais une date devinée.
 */
export function memoryDurationIso(duration: MemoryDuration, nowMs: number = Date.now()): string | null {
  if (duration === 'none') return null
  const target = new Date(nowMs + DURATION_DAYS[duration] * 24 * 60 * 60 * 1000)
  return endOfDayIso(target.toISOString().slice(0, 10))
}
