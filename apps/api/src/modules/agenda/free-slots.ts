import {
  isOwnerUnavailable,
  type AgendaConflict,
  type AgendaDuplicateEvent,
  type AgendaEvent,
  type AgendaOwnerUnavailableConflict,
  type AgendaProximityConflict,
  type AgendaTravelConflict,
  type FreeSlot,
  type FreeSlotsRequest,
} from '@bellum/contracts'
import { zonedParts, zonedTimeToInstant } from './time-zone'

/**
 * Créneaux libres et conflits — deux calculs purs qui répondent à quatre
 * besoins des méta-analyses : « identifier les créneaux libres pour prospecter »
 * (§5.2 n°7), « proposer 3 créneaux quand un RDV est annulé » (requête n°22),
 * « bloquer des créneaux de prospection » (déclencheur n°6) et « détecter les
 * conflits d'agenda » (déclencheur n°20).
 *
 * Ils sont ici, hors du service et hors du fournisseur, pour une raison simple :
 * ce sont les seuls endroits du socle agenda où une erreur est invisible. Un
 * appel réseau raté se voit ; un créneau proposé pendant un rendez-vous existant
 * ne se voit qu'au moment où le client répond « je ne suis pas libre ».
 */

type Interval = { start: number; end: number }

/** Un évènement devient un intervalle borné, ou rien si ses dates sont inutilisables. */
function toInterval(event: AgendaEvent): Interval | null {
  if (!event.start || !event.end) return null
  const start = Date.parse(event.start)
  const end = Date.parse(event.end)
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null
  return { start, end }
}

/** Fusionne les intervalles qui se chevauchent ou se touchent. */
function mergeBusy(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end)
    else merged.push({ ...interval })
  }
  return merged
}

/**
 * Les créneaux libres d'au moins `durationMinutes`, à l'intérieur des heures
 * ouvrées déclarées et des jours ouvrés déclarés.
 *
 * Un évènement annulé ne bloque rien : le fournisseur le rend encore pendant un
 * moment, et proposer un créneau occupé par une réunion annulée serait perdre
 * du temps de vente pour rien.
 */
export function computeFreeSlots(
  events: AgendaEvent[],
  window: { from: Date; to: Date },
  request: Pick<
    FreeSlotsRequest,
    'durationMinutes' | 'workdayStartHour' | 'workdayEndHour' | 'workdays' | 'timeZone' | 'limit'
  > & { mergeHoles?: boolean },
): FreeSlot[] {
  const durationMs = request.durationMinutes * 60 * 1000
  // Deux exclusions, les mêmes que `detectConflicts` — et pour la même raison.
  //
  // Un évènement « journée entière » n'a pas d'heure : ses bornes sont des
  // dates nues, il s'étend donc de minuit à minuit. Le compter comme occupé
  // rendait `[]` sur des journées entièrement libres dès qu'un marqueur de
  // présence traînait — « Office », « Télétravail », l'anniversaire d'un
  // collègue —, et l'écran répondait « aucun créneau » sans rien dire d'autre.
  //
  // Un marqueur de ce genre est un contexte, pas un rendez-vous. Et le coût
  // d'erreur est asymétrique : bloquer à tort ne laisse aucun recours, tandis
  // qu'un créneau proposé sous un marqueur bien visible dans la grille peut se
  // refuser d'un coup d'œil.
  const busy = mergeBusy(
    events
      .filter(event => !event.cancelled && isTimed(event))
      .flatMap(event => {
        const interval = toInterval(event)
        return interval ? [interval] : []
      }),
  )

  const slots: FreeSlot[] = []
  const workdays = new Set(request.workdays)

  // On avance jour ouvré par jour ouvré plutôt qu'en balayant la fenêtre en
  // continu : c'est ce qui garantit qu'un créneau ne peut jamais enjamber la
  // nuit ni un week-end, même si l'agenda est totalement vide.
  for (let cursor = new Date(window.from); cursor <= window.to; ) {
    const parts = zonedParts(cursor, request.timeZone)
    if (!workdays.has(parts.isoWeekday)) {
      cursor = nextLocalMidnight(cursor, request.timeZone)
      continue
    }

    const dayStart = zonedTimeToInstant(
      { year: parts.year, month: parts.month, day: parts.day, hour: request.workdayStartHour },
      request.timeZone,
    )
    const dayEnd = zonedTimeToInstant(
      { year: parts.year, month: parts.month, day: parts.day, hour: request.workdayEndHour % 24 },
      request.timeZone,
    )
    // `workdayEndHour === 24` désigne minuit du lendemain.
    const dayEndMs = request.workdayEndHour === 24 ? dayEnd.getTime() + 24 * 3600_000 : dayEnd.getTime()

    let pointer = Math.max(dayStart.getTime(), window.from.getTime())
    const limit = Math.min(dayEndMs, window.to.getTime())

    for (const interval of busy) {
      if (interval.end <= pointer) continue
      if (interval.start >= limit) break
      if (interval.start - pointer >= durationMs) {
        pushSlot(slots, pointer, interval.start, durationMs, request.mergeHoles)
      }
      pointer = Math.max(pointer, interval.end)
      if (pointer >= limit) break
    }
    if (limit - pointer >= durationMs) pushSlot(slots, pointer, limit, durationMs, request.mergeHoles)

    if (slots.length >= request.limit) break
    cursor = nextLocalMidnight(cursor, request.timeZone)
  }

  return slots.slice(0, request.limit)
}

/** Un trou peut contenir plusieurs créneaux de la durée demandée ; on les découpe. */
function pushSlot(slots: FreeSlot[], fromMs: number, toMs: number, durationMs: number, mergeHoles = false): void {
  // #5 — le trou entier (`mergeHoles`), pas ses tranches.
  if (mergeHoles) {
    slots.push({
      start: new Date(fromMs).toISOString(),
      end: new Date(toMs).toISOString(),
      minutes: Math.round((toMs - fromMs) / 60000),
    })
    return
  }
  for (let start = fromMs; toMs - start >= durationMs; start += durationMs) {
    slots.push({
      start: new Date(start).toISOString(),
      end: new Date(start + durationMs).toISOString(),
      minutes: Math.round(durationMs / 60000),
    })
  }
}

/** Minuit local suivant, dans le fuseau donné. */
function nextLocalMidnight(instant: Date, timeZone: string): Date {
  const parts = zonedParts(instant, timeZone)
  const midnight = zonedTimeToInstant({ year: parts.year, month: parts.month, day: parts.day, hour: 0 }, timeZone)
  // +26 h puis normalisation : franchit un jour même quand il ne dure que 23 h.
  const nextDay = new Date(midnight.getTime() + 26 * 3600_000)
  const nextParts = zonedParts(nextDay, timeZone)
  return zonedTimeToInstant({ year: nextParts.year, month: nextParts.month, day: nextParts.day, hour: 0 }, timeZone)
}

/** Les évènements minutés, non annulés, triés par début — la base commune aux
 *  trois détecteurs de conflit ci-dessous. */
function timedSortedEntries(events: AgendaEvent[]): Array<{ event: AgendaEvent; interval: Interval }> {
  return events
    .filter(event => !event.cancelled && isTimed(event))
    .map(event => ({ event, interval: toInterval(event) }))
    .flatMap(entry => (entry.interval ? [{ event: entry.event, interval: entry.interval }] : []))
    .sort((a, b) => a.interval.start - b.interval.start)
}

/**
 * Les chevauchements réels de l'agenda.
 *
 * Deux exclusions volontaires : les évènements annulés (ils ne prennent plus de
 * place) et les évènements « journée entière », qui se chevauchent par
 * construction avec tout le reste et noieraient les vrais conflits sous du
 * bruit — un congé posé ne fait pas d'une réunion un conflit à arbitrer.
 */
export function detectConflicts(events: AgendaEvent[]): AgendaConflict[] {
  const timed = timedSortedEntries(events)

  const conflicts: AgendaConflict[] = []
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i]!
      const b = timed[j]!
      if (b.interval.start >= a.interval.end) break
      const overlap = Math.min(a.interval.end, b.interval.end) - b.interval.start
      if (overlap > 0) {
        conflicts.push({
          first: a.event,
          second: b.event,
          overlapMinutes: Math.round(overlap / 60000),
        })
      }
    }
  }
  return conflicts
}

/**
 * Le battement minimal attendu entre deux rendez-vous DISTINCTS, en minutes —
 * #2390.5. En-deçà, `detectProximityConflicts` signale l'enchaînement.
 *
 * Deux évènements qui se TOUCHENT exactement (battement de 0 minute) restent
 * volontairement hors de ce calcul : c'est le cas d'un agenda planifié à la
 * minute près (9 h-10 h puis 10 h-11 h), déjà couvert par le test historique
 * de `detectConflicts` (« ne signale rien pour deux évènements qui se
 * touchent ») — ce chantier ajoute un signal, il n'en retire pas un qui
 * marchait.
 */
export const MIN_MEETING_GAP_MINUTES = 15

/**
 * Les enchaînements trop serrés — #2390.5 (LAU-FINAL-104).
 *
 * Un type de retour SÉPARÉ de `detectConflicts` (`AgendaProximityConflict`,
 * pas `AgendaConflict`) : ces deux évènements ne se chevauchent PAS, et
 * `overlapMinutes` est lu ailleurs (briefing, routines) comme un vrai
 * chevauchement horaire.
 */
export function detectProximityConflicts(events: AgendaEvent[]): AgendaProximityConflict[] {
  const timed = timedSortedEntries(events)
  const thresholdMs = MIN_MEETING_GAP_MINUTES * 60_000

  const conflicts: AgendaProximityConflict[] = []
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i]!
      const b = timed[j]!
      const gap = b.interval.start - a.interval.end
      if (gap >= thresholdMs) break
      // gap <= 0 : chevauchement ou contact exact — l'affaire de detectConflicts, pas la nôtre.
      if (gap > 0) {
        conflicts.push({ first: a.event, second: b.event, gapMinutes: Math.round(gap / 60000) })
      }
    }
  }
  return conflicts
}

/** Le titre normalisé d'un évènement, ou `null` s'il n'y a rien à comparer —
 *  deux évènements sans titre ne sont jamais dits « en double » : ce serait un
 *  rapprochement inventé, pas une donnée lue. */
function normalizedTitle(event: AgendaEvent): string | null {
  const value = event.summary?.trim().toLowerCase()
  return value ? value : null
}

/**
 * Les évènements en double — #2390.7 (LAU-FINAL-104) : même créneau EXACT,
 * même titre (à la casse et aux espaces près), identifiants différents.
 */
export function detectDuplicateEvents(events: AgendaEvent[]): AgendaDuplicateEvent[] {
  const groups = new Map<string, AgendaEvent[]>()
  for (const event of events) {
    if (event.cancelled || !isTimed(event)) continue
    const title = normalizedTitle(event)
    if (!title) continue
    const key = `${event.start}|${event.end}|${title}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(event)
    else groups.set(key, [event])
  }

  const duplicates: AgendaDuplicateEvent[] = []
  for (const bucket of groups.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const first = bucket[i]!
        const second = bucket[j]!
        if (first.id === second.id) continue
        duplicates.push({ first, second })
      }
    }
  }
  return duplicates
}

/** Un évènement « journée entière » n'a pas d'heure : sa borne est une date nue. */
function isTimed(event: AgendaEvent): boolean {
  return Boolean(event.start && event.start.includes('T'))
}

/** Un lieu normalisé pour comparaison, ou `null` s'il n'y a rien d'exploitable
 *  — un lieu vide ne prouve aucun déplacement. */
function normalizedLocation(event: AgendaEvent): string | null {
  const value = event.location?.trim().toLowerCase()
  return value ? value : null
}

/** Un rendez-vous EN PRÉSENTIEL : un lieu renseigné, aucun lien visio — un
 *  rendez-vous visio se tient depuis n'importe où, il n'impose aucun
 *  déplacement. */
function isPhysical(event: AgendaEvent): boolean {
  return normalizedLocation(event) !== null && !event.conferenceUrl
}

/**
 * Temps de déplacement impossible — #2390.3 (LAU-FINAL-104).
 *
 * Sans donnée de trajet (aucune carte branchée, doctrine « jamais de donnée
 * fictive » — on ne devine pas une distance), le seul cas affirmable SANS
 * inventer un chiffre est celui où le battement est NUL : deux rendez-vous en
 * présentiel, à des lieux DIFFÉRENTS, qui s'enchaînent à la minute près. Zéro
 * minute pour se déplacer entre deux lieux différents est impossible, quelle
 * que soit la distance réelle — c'est exactement le cas que
 * `detectProximityConflicts` (battement < 15 min) et le témoin historique de
 * `detectConflicts` (« deux évènements qui se touchent exactement ») laissent
 * volontairement de côté, précisément parce qu'aucun des deux ne regarde le
 * lieu.
 */
export function detectTravelConflicts(events: AgendaEvent[]): AgendaTravelConflict[] {
  const timed = timedSortedEntries(events)

  const conflicts: AgendaTravelConflict[] = []
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i]!
      const b = timed[j]!
      const gap = b.interval.start - a.interval.end
      if (gap > 0) break // trié par début : au-delà, l'écart ne peut que grandir.
      if (gap < 0) continue // chevauchement — l'affaire de detectConflicts.
      if (!isPhysical(a.event) || !isPhysical(b.event)) continue
      if (normalizedLocation(a.event) === normalizedLocation(b.event)) continue
      conflicts.push({ first: a.event, second: b.event })
    }
  }
  return conflicts
}

/**
 * Un rendez-vous qui tombe sur un bloc où son propriétaire s'est déclaré
 * indisponible — #2390.6.
 *
 * Volontairement SANS `timedSortedEntries` : le bloc d'indisponibilité
 * (`eventType: outOfOffice` côté Google) est souvent posé en « journée
 * entière », exactement le cas que les autres détecteurs de ce fichier
 * excluent (« un congé posé ne fait pas d'une réunion un conflit à
 * arbitrer »). Ici c'est l'inverse : un bloc d'indisponibilité EST le signal
 * qu'on cherche, journée entière ou non — `toInterval` sait déjà le borner
 * (minuit à minuit pour une date nue).
 */
export function detectOwnerUnavailableConflicts(events: AgendaEvent[]): AgendaOwnerUnavailableConflict[] {
  const withIntervals = events
    .filter(candidate => !candidate.cancelled)
    .map(candidate => ({ event: candidate, interval: toInterval(candidate) }))
    .flatMap(entry => (entry.interval ? [{ event: entry.event, interval: entry.interval }] : []))

  const unavailability = withIntervals.filter(entry => isOwnerUnavailable(entry.event))
  // Le bloc d'indisponibilité lui-même n'est jamais son propre « rendez-vous » —
  // exclu même quand `isOwnerUnavailable` serait vrai pour les deux par erreur
  // de fournisseur.
  const meetings = withIntervals.filter(entry => isTimed(entry.event) && !isOwnerUnavailable(entry.event))

  const conflicts: AgendaOwnerUnavailableConflict[] = []
  for (const block of unavailability) {
    for (const meeting of meetings) {
      const overlap =
        Math.min(block.interval.end, meeting.interval.end) - Math.max(block.interval.start, meeting.interval.start)
      if (overlap > 0) {
        conflicts.push({
          meeting: meeting.event,
          unavailability: block.event,
          overlapMinutes: Math.round(overlap / 60000),
        })
      }
    }
  }
  return conflicts
}
