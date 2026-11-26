import type { FreeSlot } from '@bellum/contracts'

/**
 * Théo A today-agenda.R3 — le créneau d'« Ajouter un rendez-vous », composé
 * depuis trois champs que le commercial tape (date, heure, durée), dans le
 * fuseau du POSTE comme le reste de l'agenda. Une saisie incomplète donne
 * `null` : on ne devine jamais un horaire (une invitation part à la validation).
 */
export function slotFromInputs(date: string, time: string, durationMinutes: number): FreeSlot | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const hour = /^(\d{2}):(\d{2})$/.exec(time)
  if (!day || !hour || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return null
  const start = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), Number(hour[1]), Number(hour[2]))
  if (Number.isNaN(start.getTime())) return null
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  return { start: start.toISOString(), end: end.toISOString(), minutes: durationMinutes }
}

/** L'inverse : les valeurs des trois champs pour un créneau donné. */
export function slotToInputs(slot: FreeSlot): { date: string; time: string; duration: number } {
  const start = new Date(slot.start)
  const end = new Date(slot.end)
  const two = (value: number) => String(value).padStart(2, '0')
  return {
    date: `${start.getFullYear()}-${two(start.getMonth() + 1)}-${two(start.getDate())}`,
    time: `${two(start.getHours())}:${two(start.getMinutes())}`,
    duration: Math.round((end.getTime() - start.getTime()) / 60_000),
  }
}

/** Le point de départ du formulaire : la prochaine heure pleine, trente minutes. */
export function defaultNewEventSlot(now: Date): FreeSlot {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0)
  const end = new Date(start.getTime() + 30 * 60_000)
  return { start: start.toISOString(), end: end.toISOString(), minutes: 30 }
}
