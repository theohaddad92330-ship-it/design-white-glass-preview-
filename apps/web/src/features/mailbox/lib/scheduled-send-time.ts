/**
 * Théo M2 — envoi programmé — l'heure d'un envoi s'entend dans le fuseau de l'UTILISATEUR (celui de son profil),
 * pas dans celui de l'appareil du moment. Ces fonctions convertissent la saisie `datetime-local` en instant absolu
 * (et retour), par `Intl` seul : aucune bibliothèque de fuseaux.
 */

/** Le fuseau de référence nommé du produit, quand l'utilisateur n'en a pas enregistré (voir `ProfileIdentityPage`). */
const REFERENCE_TIME_ZONE = 'Europe/Paris'

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

export function userTimeZone(saved: string | null | undefined): string {
  if (!saved) return REFERENCE_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: saved })
    return saved
  } catch {
    return REFERENCE_TIME_ZONE
  }
}

/** L'heure murale, dans `timeZone`, de l'instant `date` — en millisecondes « comme si c'était UTC ». */
function wallClockMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value)
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'))
}

/** `2026-10-23T09:30` lu dans `timeZone` → ISO UTC. `null` pour une saisie incomplète : jamais une date devinée. */
export function zonedLocalToIso(local: string, timeZone: string): string | null {
  const match = LOCAL_PATTERN.exec(local)
  if (!match) return null
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number]
  const asUtc = Date.UTC(y, mo - 1, d, h, mi)
  // Deux passes : la seconde corrige l'écart quand l'instant deviné tombe de l'autre côté d'un changement d'heure.
  let instant = asUtc - (wallClockMs(new Date(asUtc), timeZone) - asUtc)
  instant = asUtc - (wallClockMs(new Date(instant), timeZone) - instant)
  return new Date(instant).toISOString()
}

/** ISO → `2026-10-23T09:30` dans `timeZone`, pour pré-remplir le sélecteur. */
export function isoToZonedLocal(iso: string, timeZone: string): string {
  return new Date(wallClockMs(new Date(iso), timeZone)).toISOString().slice(0, 16)
}
