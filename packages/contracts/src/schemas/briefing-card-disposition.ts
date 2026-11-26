import { z } from 'zod'

/**
 * #2099.17-.32 (épopée #2767) — CE QUE LA PERSONNE A DÉCIDÉ D'UNE CARTE DU JOUR.
 *
 * Trois gestes secondaires de #2099 : Reporter, Pas pertinent (avec l'un des
 * six motifs), Déjà traité. Tous posés PAR PERSONNE, dans le même sac
 * `user_preferences` que `briefingRoleFit`/`agendaSlotRejections` — aucune
 * migration, et surtout aucune écriture sur l'objet source (#2099.32 : « le
 * refus nourrit les recommandations futures sans modifier la vérité partagée
 * globale ») : refuser une relance ne touche ni le fil, ni le compte, ni ce
 * que voit un collègue.
 *
 * Un geste s'accroche à l'IDENTIFIANT de la carte (`meeting:<id>`,
 * `payment:<id>`…, stable d'un jour à l'autre) ET à la date du FAIT qui l'a
 * produite : un refus est respecté tant que le fait est le même, mais un fait
 * NOUVEAU sur le même objet est une raison de revenir (#2099.54 — « la même
 * action ne réapparaît pas […] sans raison »).
 */

export const BRIEFING_CARD_DISPOSITIONS = ['postponed', 'dismissed', 'done'] as const
export const briefingCardDispositionKindSchema = z.enum(BRIEFING_CARD_DISPOSITIONS)

/** #2099.21-.24 — dans l'ordre de l'issue. */
export const BRIEFING_POSTPONE_OPTIONS = ['this_afternoon', 'tomorrow', 'this_week', 'custom'] as const
export type BriefingPostponeOption = (typeof BRIEFING_POSTPONE_OPTIONS)[number]

/** #2099.26-.31 — dans l'ordre de l'issue. */
export const BRIEFING_DISMISS_REASONS = [
  'wrong_priority',
  'already_handled',
  'wrong_data',
  'not_now',
  'out_of_scope',
  'other',
] as const
export const briefingDismissReasonSchema = z.enum(BRIEFING_DISMISS_REASONS)
export type BriefingDismissReason = z.infer<typeof briefingDismissReasonSchema>

/**
 * #3671 — trois choses distinctes : fait confirmé, préférence commerciale,
 * retour de qualité. « Donnée fausse » corrige le FAIT (il ne revient pas tel
 * quel tant que le fait n'a pas changé) ; les autres motifs sont une
 * PRÉFÉRENCE pour cette personne — jamais la preuve d'une absence de projet.
 */
export type BriefingDismissNature = 'fact_correction' | 'preference'
export function briefingDismissReasonNature(reason: BriefingDismissReason | null): BriefingDismissNature {
  return reason === 'wrong_data' || reason === 'already_handled' ? 'fact_correction' : 'preference'
}

const factObservedAt = z.string().min(1).nullable()

export const briefingCardDispositionRequestSchema = z.discriminatedUnion('disposition', [
  z.object({
    actionId: z.string().min(1).max(200),
    disposition: z.literal('postponed'),
    /** L'instant où la carte a le droit de revenir — calculé par l'écran
     *  (`briefingPostponeUntil`), qui connaît le fuseau de la personne. */
    until: z.string().datetime({ offset: true }),
    factObservedAt: factObservedAt.default(null),
  }),
  z.object({
    actionId: z.string().min(1).max(200),
    disposition: z.literal('dismissed'),
    reason: briefingDismissReasonSchema,
    factObservedAt: factObservedAt.default(null),
  }),
  z.object({
    actionId: z.string().min(1).max(200),
    disposition: z.literal('done'),
    factObservedAt: factObservedAt.default(null),
  }),
])
export type BriefingCardDispositionRequest = z.input<typeof briefingCardDispositionRequestSchema>

export const briefingCardDispositionSchema = z.object({
  actionId: z.string().min(1),
  disposition: briefingCardDispositionKindSchema,
  reason: briefingDismissReasonSchema.nullable(),
  until: z.string().nullable(),
  factObservedAt: z.string().nullable(),
  at: z.string(),
})
export type BriefingCardDisposition = z.infer<typeof briefingCardDispositionSchema>

/** Borné comme `agendaSlotRejections` : un sac sans fin grossirait pour rien. */
const MAX_DISPOSITIONS_KEPT = 200
const DAY_MS = 24 * 3600_000
/** « Pas maintenant » est un report sans date : il tient la journée, pas plus. */
const NOT_NOW_MS = DAY_MS
/** Un refus (ou un « déjà traité ») n'engage pas la personne pour toujours :
 *  passé ce délai, même sans fait nouveau, la carte a le droit de revenir. */
const DISMISSAL_MS = 30 * DAY_MS

export function readBriefingCardDispositions(
  bag: Record<string, unknown> | null | undefined,
): BriefingCardDisposition[] {
  if (!bag || typeof bag !== 'object') return []
  const value = bag.briefingCardDispositions
  if (!Array.isArray(value)) return []
  return value.flatMap(entry => {
    const parsed = briefingCardDispositionSchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

/** Pose un geste — un seul par carte (le dernier gagne), sac borné. */
export function withBriefingCardDisposition(
  current: readonly BriefingCardDisposition[],
  request: BriefingCardDispositionRequest,
  now: Date,
): BriefingCardDisposition[] {
  const entry: BriefingCardDisposition = {
    actionId: request.actionId,
    disposition: request.disposition,
    reason: request.disposition === 'dismissed' ? request.reason : null,
    until: request.disposition === 'postponed' ? new Date(request.until).toISOString() : null,
    factObservedAt: request.factObservedAt ?? null,
    at: now.toISOString(),
  }
  return [...current.filter(existing => existing.actionId !== request.actionId), entry].slice(-MAX_DISPOSITIONS_KEPT)
}

function isStillHeld(entry: BriefingCardDisposition, currentFactAt: string | null, now: Date): boolean {
  const nowMs = now.getTime()
  if (entry.disposition === 'postponed') {
    return entry.until !== null && Date.parse(entry.until) > nowMs
  }
  if ((entry.factObservedAt ?? null) !== currentFactAt) return false
  // un fait déclaré faux tient tant que le fait est le même (aucun plafond de temps)
  if (entry.disposition === 'dismissed' && briefingDismissReasonNature(entry.reason) === 'fact_correction') {
    return entry.reason === 'wrong_data' || Date.parse(entry.at) + DISMISSAL_MS > nowMs
  }
  const heldFor = entry.reason === 'not_now' ? NOT_NOW_MS : DISMISSAL_MS
  return Date.parse(entry.at) + heldFor > nowMs
}

/**
 * #2099.52 — retire du brief les cartes que la personne a reportées, refusées
 * ou déclarées traitées. Pure ; un sac vide rend la liste inchangée.
 */
export function excludeDisposedBriefingActions<
  T extends { id: string; fact: { provenance: { observedAt: string | null } } | null },
>(actions: T[], dispositions: readonly BriefingCardDisposition[], now: Date): T[] {
  if (dispositions.length === 0) return actions
  const byId = new Map(dispositions.map(entry => [entry.actionId, entry]))
  return actions.filter(action => {
    const entry = byId.get(action.id)
    return !entry || !isStillHeld(entry, action.fact?.provenance.observedAt ?? null, now)
  })
}

function wallClock(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    })
      .formatToParts(instant)
      .map(part => [part.type, part.value]),
  )
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    isoWeekday: weekdays[String(parts.weekday)] ?? 1,
  }
}

/** L'instant d'une heure murale `hour:00` du jour (année, mois, jour) dans `timeZone`. */
function instantAt(year: number, month: number, day: number, hour: number, timeZone: string): Date {
  const naive = Date.UTC(year, month - 1, day, hour)
  const seen = wallClock(new Date(naive), timeZone)
  const asIfUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute)
  return new Date(naive - (asIfUtc - naive))
}

const AFTERNOON_HOUR = 14
const MORNING_HOUR = 9
const LATE_AFTERNOON_DELAY_MS = 3 * 3600_000

/**
 * #2099.21-.24 — QUAND la carte a le droit de revenir, pour chaque option.
 * Tranché sans Louis : « cet après-midi » = 14 h (ou +3 h si 14 h est passé),
 * « demain » = 9 h le lendemain, « cette semaine » = vendredi 9 h (lundi
 * suivant à partir du vendredi), date personnalisée = 9 h ce jour-là. Une date
 * passée ou illisible rend `null` — jamais une date devinée à la place.
 */
export function briefingPostponeUntil(
  option: BriefingPostponeOption,
  now: Date,
  timeZone: string,
  customDate?: string,
): string | null {
  const today = wallClock(now, timeZone)
  const dayAfter = (offset: number) => {
    const shifted = new Date(Date.UTC(today.year, today.month - 1, today.day + offset))
    return instantAt(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), MORNING_HOUR, timeZone)
  }
  switch (option) {
    case 'this_afternoon': {
      const afternoon = instantAt(today.year, today.month, today.day, AFTERNOON_HOUR, timeZone)
      return (
        afternoon.getTime() > now.getTime() ? afternoon : new Date(now.getTime() + LATE_AFTERNOON_DELAY_MS)
      ).toISOString()
    }
    case 'tomorrow':
      return dayAfter(1).toISOString()
    case 'this_week':
      return dayAfter(today.isoWeekday < 5 ? 5 - today.isoWeekday : 8 - today.isoWeekday).toISOString()
    case 'custom': {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(customDate ?? '')
      if (!match) return null
      const at = instantAt(Number(match[1]), Number(match[2]), Number(match[3]), MORNING_HOUR, timeZone)
      return Number.isNaN(at.getTime()) || at.getTime() <= now.getTime() ? null : at.toISOString()
    }
  }
}
