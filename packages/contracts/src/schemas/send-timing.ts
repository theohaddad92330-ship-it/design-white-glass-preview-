import { z } from 'zod'

/**
 * #3289 (#3264.31/.32/.33) — le TIMING appris, par espace.
 *
 * Les lots précédents concluaient « aucune table d'événements d'envoi horodatés
 * avec résultat » : elle existe, c'est `action_plan_items` — un geste FAIT porte
 * son canal (`channel`), son horodatage réel (`completed_at`), son contact
 * (fuseau, séniorité) et son issue déclarée (`outcome`). Ce module n'ajoute
 * AUCUNE donnée : il MESURE ce que l'espace a déjà déclaré.
 *
 * Ce qu'il ne fait jamais (doctrine) :
 *  - aucun pourcentage ni probabilité : on rend « 4 réponses sur 6 », le rang
 *    interne se sert d'un rapport qui ne sort pas du module ;
 *  - aucun créneau sans mesure : sous {@link SEND_TIMING_MIN_ATTEMPTS}
 *    tentatives le meilleur créneau est `null` et la RAISON est nommée ;
 *  - aucun créneau qui ne fait pas mieux que la moyenne du canal.
 *
 * Tranché sans Louis : le seuil est 4 tentatives par créneau — assez pour que
 * « 3 réponses sur 4 » ne soit pas un coup de chance unique, assez bas pour
 * qu'une équipe de trois commerciaux le franchisse en un mois.
 */
export const SEND_TIMING_MIN_ATTEMPTS = 4

export const SEND_TIMING_CHANNELS = ['phone', 'email', 'linkedin', 'meeting'] as const
export const SEND_TIMING_WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const
/** Plages de la journée de travail, en heure LOCALE du contact. Hors plage
 *  (nuit, week-end) : jamais recommandé, donc jamais compté. */
export const SEND_TIMING_BANDS = ['morning', 'midday', 'afternoon', 'evening'] as const

/** Le fuseau de référence NOMMÉ du produit — le même que `REFERENCE_TIMEZONE`
 *  côté `apps/ia` (`current_time.py`), dernière marche de l'escalier
 *  contact → espace → référence. */
const REFERENCE_TIMEZONE = 'Europe/Paris'

const ANSWERED = new Set([
  'positive',
  'qualified',
  'connected_qualified',
  'meeting_booked',
  'callback_scheduled',
  'need_confirmed',
  'information_obtained',
  'orientation_given',
  'declined',
  'refused',
  'deferred',
  'not_now',
  'need_not_confirmed',
])
const SILENT = new Set(['no_response', 'no_answer'])

export type TimingOutcomeClass = 'answered' | 'silent'

/** `null` : l'issue ne parle pas d'horaire (mauvais contact, erreur technique…). */
export function classifyTimingOutcome(outcome: string | null): TimingOutcomeClass | null {
  if (outcome === null) return null
  if (ANSWERED.has(outcome)) return 'answered'
  if (SILENT.has(outcome)) return 'silent'
  return null
}

export type SendTimingObservation = {
  channel: string | null
  /** L'instant RÉEL de l'action faite (`completed_at`). */
  at: string
  contactTimezone: string | null
  outcome: string | null
  seniority: string | null
}

const bandSchema = z.enum(SEND_TIMING_BANDS)
const weekdaySchema = z.enum(SEND_TIMING_WEEKDAYS)

export const sendTimingSlotSchema = z
  .object({
    weekday: weekdaySchema,
    band: bandSchema,
    answered: z.number().int().nonnegative(),
    attempts: z.number().int().positive(),
  })
  .strict()
export type SendTimingSlot = z.infer<typeof sendTimingSlotSchema>

export const sendTimingChannelSchema = z
  .object({
    channel: z.enum(SEND_TIMING_CHANNELS),
    /** Tentatives mesurées (issue classée, dans une plage de travail). */
    attempts: z.number().int().nonnegative(),
    answered: z.number().int().nonnegative(),
    /** Observations exclues : hors plage de travail ou fuseau illisible. */
    ignored: z.number().int().nonnegative(),
    best: sendTimingSlotSchema.nullable(),
    /** Pourquoi `best` est `null` — jamais un silence. */
    reason: z.enum(['not_enough_attempts', 'no_difference']).nullable(),
  })
  .strict()
export type SendTimingChannel = z.infer<typeof sendTimingChannelSchema>

export const sendTimingSchema = z
  .object({
    seniority: z.string().nullable(),
    channels: z.array(sendTimingChannelSchema),
  })
  .strict()
export type SendTiming = z.infer<typeof sendTimingSchema>

const WEEKDAY_BY_INTL: Record<string, (typeof SEND_TIMING_WEEKDAYS)[number]> = {
  Mon: 'monday',
  Tue: 'tuesday',
  Wed: 'wednesday',
  Thu: 'thursday',
  Fri: 'friday',
}

function bandOfHour(hour: number): (typeof SEND_TIMING_BANDS)[number] | null {
  if (hour >= 8 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 14) return 'midday'
  if (hour >= 14 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 21) return 'evening'
  return null
}

/** Le créneau LOCAL d'un instant, ou `null` (hors plage, week-end, fuseau/instant illisible). */
function localSlot(at: string, timeZone: string) {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return null
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(date)
    const weekday = WEEKDAY_BY_INTL[parts.find(p => p.type === 'weekday')?.value ?? '']
    const hour = Number(parts.find(p => p.type === 'hour')?.value) % 24
    const band = bandOfHour(hour)
    return weekday && band ? { weekday, band } : null
  } catch {
    return null
  }
}

function isKnownChannel(channel: string | null): channel is (typeof SEND_TIMING_CHANNELS)[number] {
  return channel !== null && (SEND_TIMING_CHANNELS as readonly string[]).includes(channel)
}

export function computeSendTiming(
  observations: readonly SendTimingObservation[],
  options: { workspaceTimezone: string | null; seniority?: string },
): SendTiming {
  const seniority = options.seniority ?? null
  const scoped = seniority === null ? observations : observations.filter(o => o.seniority === seniority)
  const byChannel = new Map<
    (typeof SEND_TIMING_CHANNELS)[number],
    { answered: number; attempts: number; ignored: number; slots: Map<string, SendTimingSlot> }
  >()
  for (const o of scoped) {
    if (!isKnownChannel(o.channel)) continue
    const outcomeClass = classifyTimingOutcome(o.outcome)
    if (outcomeClass === null) continue
    const entry = byChannel.get(o.channel) ?? { answered: 0, attempts: 0, ignored: 0, slots: new Map() }
    byChannel.set(o.channel, entry)
    // L'escalier existant : contact → espace → référence nommée.
    const timeZone = o.contactTimezone?.trim() || options.workspaceTimezone?.trim() || REFERENCE_TIMEZONE
    const slot = localSlot(o.at, timeZone)
    if (!slot) {
      entry.ignored += 1
      continue
    }
    const key = `${slot.weekday}:${slot.band}`
    const current = entry.slots.get(key) ?? { ...slot, answered: 0, attempts: 0 }
    current.attempts += 1
    entry.attempts += 1
    if (outcomeClass === 'answered') {
      current.answered += 1
      entry.answered += 1
    }
    entry.slots.set(key, current as SendTimingSlot)
  }

  const channels: SendTimingChannel[] = [...byChannel.entries()].map(([channel, entry]) => {
    const eligible = [...entry.slots.values()].filter(s => s.attempts >= SEND_TIMING_MIN_ATTEMPTS)
    let best: SendTimingSlot | null = null
    let reason: SendTimingChannel['reason'] = null
    if (eligible.length === 0) {
      reason = 'not_enough_attempts'
    } else {
      // Rang interne par rapport de réponses, départage par le nombre de tentatives.
      // Comparaison par produit croisé : aucune division, aucun taux en sortie.
      const top = eligible.reduce((a, b) => {
        const lhs = a.answered * b.attempts
        const rhs = b.answered * a.attempts
        return lhs !== rhs ? (lhs > rhs ? a : b) : a.attempts >= b.attempts ? a : b
      })
      // Doit faire STRICTEMENT mieux que la moyenne du canal.
      if (top.answered * entry.attempts > entry.answered * top.attempts) best = top
      else reason = 'no_difference'
    }
    return {
      channel,
      attempts: entry.attempts,
      answered: entry.answered,
      ignored: entry.ignored,
      best,
      reason,
    }
  })
  channels.sort((a, b) => b.attempts - a.attempts || a.channel.localeCompare(b.channel))
  return { seniority, channels }
}

const WEEKDAY_INDEX: Record<(typeof SEND_TIMING_WEEKDAYS)[number], number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
}

/**
 * #3289.29 — la cadence tient compte du TIMING appris : chaque échéance
 * (`YYYY-MM-DD`, dans l'ordre) est calée sur le prochain jour de la semaine
 * recommandé par l'espace, JAMAIS plus tôt que sa date nominale, et deux
 * touches ne tombent jamais le même jour (la suivante passe à la semaine
 * d'après). Aucun coefficient : le rythme nominal du motif reste la source, le
 * jour appris ne fait que le décaler vers l'avant. `weekday === null` (aucun
 * créneau mesuré) rend les dates inchangées — jamais un jour deviné.
 *
 * Tranché sans Louis : seul le JOUR se cale (la plage horaire n'a pas de sens
 * pour une échéance datée) ; canal, rôle et préférences ne sont pas modélisés
 * par un coefficient — le canal est celui de la mesure, le rôle se règle par la
 * séniorité de la mesure, et aucune préférence utilisateur n'est stockée.
 */
export function snapDatesToRecommendedWeekday(
  dates: readonly string[],
  weekday: (typeof SEND_TIMING_WEEKDAYS)[number] | null,
): string[] {
  if (weekday === null) return [...dates]
  const target = WEEKDAY_INDEX[weekday]
  let previous: number | null = null
  return dates.map(iso => {
    const [y, m, d] = iso.split('-').map(Number)
    let time = Date.UTC(y!, m! - 1, d!)
    time += ((target - new Date(time).getUTCDay() + 7) % 7) * 86_400_000
    if (previous !== null && time <= previous) time = previous + 7 * 86_400_000
    previous = time
    return new Date(time).toISOString().slice(0, 10)
  })
}
