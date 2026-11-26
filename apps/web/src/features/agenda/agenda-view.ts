import type { AgendaCalendar, AgendaCalendarRef, AgendaEvent } from '@bellum/contracts'
import { classifyAgendaObject, normalizeAgendaEventStatus, personAttendeesOf } from '@bellum/contracts'

/**
 * Le CALCUL de la vue agenda, sans React.
 *
 * Tout ce qui décide de ce que l'écran affirme vit ici : quelle fenêtre couvre
 * « ma journée » ou « ma semaine », où en est un rendez-vous par rapport à
 * l'heure qu'il est, comment se répartissent les évènements dans les jours. Ce
 * sont les endroits où une erreur ne se voit pas — un rendez-vous « dans 20
 * minutes » alors qu'il a commencé, un évènement de journée entière rangé la
 * veille — et ce sont donc les endroits qui se testent sans navigateur.
 *
 * Le fuseau est celui du POSTE. C'est le seul qui soit vrai pour quelqu'un en
 * déplacement : son agenda affiche les heures locales, et un écran qui lui
 * répondrait en heure de Paris lui ferait rater un rendez-vous.
 */

export type AgendaViewMode = 'day' | 'week'

/** `provider:id` — un identifiant d'agenda n'est unique que chez son fournisseur. */
export function calendarKey(ref: { provider: string; calendarId?: string; id?: string }): string {
  return `${ref.provider}:${ref.calendarId ?? ref.id ?? ''}`
}

/**
 * Quelles cases sont cochées, à partir de ce que dit le serveur.
 *
 * Les trois états — « tous », « ceux-là », « rien de choisi » — se ramènent ici
 * à une liste de cases, sinon l'utilisateur devrait deviner ce que veut dire une
 * liste vide. Rien de choisi = l'agenda par défaut du compte, parce que c'est
 * celui que le serveur lit vraiment : afficher zéro case cochée laisserait
 * croire que Bellum ne lit rien.
 */
export function checkedCalendarKeys(
  calendars: AgendaCalendar[],
  state: { readsAll: boolean; selected: AgendaCalendarRef[] },
): Set<string> {
  if (state.readsAll) return new Set(calendars.map(calendarKey))
  if (state.selected.length) return new Set(state.selected.map(calendarKey))
  return new Set(calendars.filter(calendar => calendar.primary).map(calendarKey))
}

/**
 * Ce que devient la sélection quand on coche ou décoche un agenda.
 *
 * Trois cas et trois réponses différentes, parce qu'ils ne veulent pas dire la
 * même chose côté serveur : tout cocher, c'est « tous mes agendas » (et un
 * agenda ajouté demain en fera partie) ; une partie, c'est une liste ; et vider
 * la dernière case n'est pas un réglage — ce serait un écran vide sans rien
 * pour le comprendre, donc on ne fait rien.
 */
export function toggleCalendarSelection(
  calendars: AgendaCalendar[],
  checked: Set<string>,
  toggled: AgendaCalendar,
): { kind: 'all' | 'some' | 'noop'; refs: AgendaCalendarRef[] } {
  const key = calendarKey(toggled)
  const next = calendars.filter(calendar =>
    calendarKey(calendar) === key ? !checked.has(key) : checked.has(calendarKey(calendar)),
  )

  if (!next.length) return { kind: 'noop', refs: [] }
  if (next.length === calendars.length && calendars.length > 1) return { kind: 'all', refs: [] }
  return { kind: 'some', refs: next.map(calendar => ({ provider: calendar.provider, calendarId: calendar.id })) }
}

/** Où en est un rendez-vous par rapport à maintenant. */
type EventPhase = 'past' | 'live' | 'soon' | 'later' | 'undated'

type EventTiming = {
  phase: EventPhase
  /** Minutes avant le début. `null` quand la question n'a pas de sens (en
   *  cours, passé, journée entière). */
  minutesUntil: number | null
  /** Minutes restantes quand il est en cours. */
  minutesLeft: number | null
}

/** B2-RESTES (recette prod 12/10) — au-delà, la fin n'est pas une échéance fiable (évènement sur
 *  plusieurs jours, fin mal saisie) : « En cours » sans compte à rebours plutôt que « 110146 min ». */
const MAX_RELIABLE_MINUTES_LEFT = 24 * 60

/** Le libellé du temps restant : minutes sous deux heures, heures au-delà. */
export function liveLeftDisplay(minutesLeft: number): { key: 'liveLeft' | 'liveLeftHours'; count: number } {
  return minutesLeft < 120
    ? { key: 'liveLeft', count: minutesLeft }
    : { key: 'liveLeftHours', count: Math.round(minutesLeft / 60) }
}

/** Le texte « En cours · 3 h restantes » : les clés i18n restent écrites en toutes lettres (garde i18n). */
export function liveLeftText(t: (key: string, options: { count: number }) => string, minutesLeft: number): string {
  const { key, count } = liveLeftDisplay(minutesLeft)
  return key === 'liveLeft' ? t('agenda.board.liveLeft', { count }) : t('agenda.board.liveLeftHours', { count })
}

/** À partir de quand un rendez-vous est « imminent » — le moment où on prépare
 *  son casque, pas celui où on découvre qu'il a commencé. */
export const SOON_MINUTES = 15

/**
 * Un évènement « journée entière ».
 *
 * Les fournisseurs les rendent avec une date NUE (`2026-08-18`), sans `T`.
 * Leur appliquer une heure produirait « minuit » — et un salon professionnel
 * afficherait « dans 14 h » au lieu de « toute la journée ».
 */
export function isAllDay(event: Pick<AgendaEvent, 'start'>): boolean {
  return Boolean(event.start) && !event.start?.includes('T')
}

/**
 * Un créneau PROPOSÉ (`tentative`), pas encore un rendez-vous FIXÉ.
 *
 * Les trois autres états — confirmé, annulé (déjà filtré en amont par
 * `AgendaBoard`), et `unknown` (statut absent, ligne héritée, ou un
 * fournisseur qui n'a pas su répondre) — ne réclament aucun geste : les
 * distinguer tous rendrait l'agenda illisible. `unknown` ne devient JAMAIS
 * `true` ici — un statut qu'on n'a pas pu lire n'est pas la preuve qu'il est
 * en attente de réponse, pas plus qu'il n'est la preuve qu'il est confirmé.
 */
export function isProposedAgendaEvent(event: Pick<AgendaEvent, 'status'>): boolean {
  return normalizeAgendaEventStatus(event.status) === 'tentative'
}

/**
 * #2770 (#2101.19/.21/.22/.37) — cet évènement CONFIRMÉ a-t-il été écrit par
 * BellumAI (la porte de proposition de créneau, `AgendaSlotProposalTrigger`) ?
 * Un état différent de {@link isProposedAgendaEvent} : celui-ci est un
 * rendez-vous déjà FIXÉ dans l'agenda, seule son ORIGINE est distinguée —
 * jamais confondu avec un créneau encore en attente de réponse.
 * `event.createdByBellum` est posé côté web (`AgendaBoard`, en croisant
 * `useBellumCreatedEventIds`), jamais rendu par un fournisseur.
 */
export function isBellumCreatedAgendaEvent(event: Pick<AgendaEvent, 'createdByBellum'>): boolean {
  return event.createdByBellum === true
}

/**
 * Une date NUE est un jour du calendrier, pas un instant UTC.
 *
 * `Date.parse('2026-08-20')` rend minuit UTC — soit 2 h du matin à Paris. Un
 * salon du 18 au 19 débordait ainsi sur le 20, et un jour férié apparaissait la
 * veille au soir pour les fuseaux à l'ouest. Une date nue se lit donc à minuit
 * LOCAL, là où l'utilisateur la voit dans son agenda.
 */
function dateOnlyToLocalMs(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return Number.NaN
  return new Date(year, month - 1, day).getTime()
}

function reliableMinutesLeft(minutes: number): number | null {
  return minutes > MAX_RELIABLE_MINUTES_LEFT ? null : minutes
}

function startMs(event: Pick<AgendaEvent, 'start'>): number {
  if (!event.start) return Number.NaN
  return isAllDay(event) ? dateOnlyToLocalMs(event.start) : Date.parse(event.start)
}

function endMs(event: Pick<AgendaEvent, 'start' | 'end'>): number {
  const raw = event.end
  const end = raw ? (raw.includes('T') ? Date.parse(raw) : dateOnlyToLocalMs(raw)) : Number.NaN
  return Number.isNaN(end) ? startMs(event) : end
}

/**
 * Où en est ce rendez-vous.
 *
 * Un évènement sans date exploitable rend `undated` plutôt qu'un état inventé :
 * il existe, on ne sait pas quand, et le dire est plus utile que de le ranger
 * arbitrairement au 1ᵉʳ janvier 1970.
 */
export function timingOf(event: Pick<AgendaEvent, 'start' | 'end'>, now: Date): EventTiming {
  if (isAllDay(event)) return { phase: 'undated', minutesUntil: null, minutesLeft: null }

  const start = startMs(event)
  const end = endMs(event)
  if (Number.isNaN(start)) return { phase: 'undated', minutesUntil: null, minutesLeft: null }

  const current = now.getTime()
  if (!Number.isNaN(end) && end <= current) return { phase: 'past', minutesUntil: null, minutesLeft: null }
  if (start <= current) {
    return {
      phase: 'live',
      minutesUntil: null,
      minutesLeft: Number.isNaN(end) ? null : reliableMinutesLeft(Math.max(0, Math.round((end - current) / 60_000))),
    }
  }

  const minutesUntil = Math.round((start - current) / 60_000)
  return { phase: minutesUntil <= SOON_MINUTES ? 'soon' : 'later', minutesUntil, minutesLeft: null }
}

/** Minuit local du jour d'un instant. */
export function startOfDay(date: Date): Date {
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  return day
}

/** Le lundi de la semaine d'un instant — la semaine française commence lundi,
 *  et un tableau qui commencerait dimanche décalerait toute la lecture. */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date)
  // `getDay()` : 0 = dimanche. Le lundi est donc 1, et dimanche recule de 6.
  const shift = (day.getDay() + 6) % 7
  day.setDate(day.getDate() - shift)
  return day
}

/** La fenêtre couverte par la vue, telle qu'elle sera demandée au serveur. */
export function windowFor(mode: AgendaViewMode, anchor: Date): { from: Date; to: Date } {
  const from = mode === 'week' ? startOfWeek(anchor) : startOfDay(anchor)
  const to = new Date(from)
  to.setDate(to.getDate() + (mode === 'week' ? 7 : 1))
  return { from, to }
}

/** Avancer ou reculer d'une journée / d'une semaine. */
export function shiftAnchor(mode: AgendaViewMode, anchor: Date, steps: number): Date {
  const next = new Date(anchor)
  next.setDate(next.getDate() + steps * (mode === 'week' ? 7 : 1))
  return next
}

export function isSameDay(first: Date, second: Date): boolean {
  return startOfDay(first).getTime() === startOfDay(second).getTime()
}

/** Les jours de la fenêtre, un par colonne — y compris ceux sans rendez-vous :
 *  un mercredi absent du tableau ne se lit pas « journée libre », il se lit
 *  « il manque un jour ». */
export function daysOf(mode: AgendaViewMode, anchor: Date): Date[] {
  const { from } = windowFor(mode, anchor)
  const count = mode === 'week' ? 7 : 1
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(from)
    day.setDate(day.getDate() + index)
    return day
  })
}

/**
 * Les évènements d'un jour donné.
 *
 * Un évènement de journée entière couvre plusieurs jours (un salon sur deux
 * jours) : il apparaît sur CHACUN d'eux. Sa fin est exclusive, comme la rendent
 * les fournisseurs — sans quoi un salon du 18 déborderait sur le 19.
 */
export function eventsOfDay(events: AgendaEvent[], day: Date): AgendaEvent[] {
  const dayStart = startOfDay(day).getTime()
  const dayEnd = dayStart + 86_400_000

  return events
    .filter(event => {
      const start = startMs(event)
      if (Number.isNaN(start)) return false
      if (isAllDay(event)) {
        const end = endMs(event)
        const until = Number.isNaN(end) ? start + 86_400_000 : end
        return start < dayEnd && until > dayStart
      }
      // Une réunion qui déborde de midi à 14 h appartient à son jour de début ;
      // celle qui court sur la nuit reste visible le lendemain.
      const end = endMs(event)
      return start < dayEnd && (Number.isNaN(end) ? start >= dayStart : end > dayStart)
    })
    .sort((first, second) => {
      // Les journées entières d'abord : elles décrivent le CADRE du jour, pas un
      // créneau, et les intercaler à minuit ferait croire à un rendez-vous à 0 h.
      const allDayFirst = Number(isAllDay(second)) - Number(isAllDay(first))
      if (allDayFirst) return allDayFirst
      return startMs(first) - startMs(second)
    })
}

/** Les évènements sans date exploitable — ils existent, on ne sait pas quand,
 *  et les jeter serait la seule façon de les rendre invisibles pour de bon. */
export function undatedEvents(events: AgendaEvent[]): AgendaEvent[] {
  return events.filter(event => Number.isNaN(startMs(event)))
}

/**
 * Le prochain rendez-vous — celui EN COURS d'abord.
 *
 * L'ordre est délibéré : quelqu'un qui ouvre l'écran pendant sa réunion cherche
 * le lien de CETTE réunion, pas celui de la suivante.
 */
export function currentOrNextEvent(events: AgendaEvent[], now: Date): AgendaEvent | null {
  const dated = events.filter(event => !isAllDay(event) && !Number.isNaN(startMs(event)))
  const live = dated
    .filter(event => timingOf(event, now).phase === 'live')
    .sort((first, second) => endMs(first) - endMs(second))
  if (live[0]) return live[0]

  const upcoming = dated
    .filter(event => startMs(event) > now.getTime())
    .sort((first, second) => startMs(first) - startMs(second))
  return upcoming[0] ?? null
}

/**
 * La fenêtre que le brief du matin demande au serveur (`briefing.service.ts`,
 * `buildAgendaBlock`) — « la fenêtre déborde d'un jour : un rendez-vous de
 * demain 9 h doit être préparé dans le brief d'aujourd'hui ». `BriefingPage`
 * en dérive `until` pour `dayLoad`, sans recalculer la fenêtre ailleurs.
 */
export const BRIEFING_WINDOW_HOURS = 36

/**
 * Ce qui reste de la journée : rendez-vous à venir et minutes en réunion. Les
 * journées entières ne comptent PAS de minutes — un salon n'est pas 24 h de
 * réunion, et l'annoncer ainsi rendrait le chiffre inutilisable.
 *
 * Un créneau PROPOSÉ (`tentative`) n'entre ni dans `remaining` ni dans
 * `meetingMinutes` : personne ne l'a encore accepté, et un commercial qui lit
 * « 3 rendez-vous à venir » organise sa journée autour de trois engagements
 * pris, pas de deux et d'une proposition sans réponse. Il n'est pas jeté pour
 * autant — `proposed` le compte à part, pour l'écran qui voudrait dire « + 1
 * proposé » sans avoir à reconstruire la donnée.
 *
 * `meetingMinutes` compte ce qu'il RESTE à partir de `now`, jamais depuis le
 * début réel d'un évènement déjà commencé — un fournisseur d'agenda rend un
 * évènement dès qu'il chevauche la fenêtre demandée, y compris un bloc
 * commencé bien avant `now`. Il ne compte pas non plus au-delà d'`until`, la
 * borne HAUTE de la fenêtre demandée au serveur — un bloc qui la déborde
 * (un déplacement, une absence saisie avec une heure) ne compte que la part
 * qui tombe dans la fenêtre. Omis, `until` ne borne rien (compatibilité des
 * appelants qui ne connaissent pas de fenêtre).
 */
export function dayLoad(
  events: AgendaEvent[],
  now: Date,
  until?: Date,
): { remaining: number; meetingMinutes: number; allDay: number; proposed: number } {
  const untilMs = until ? until.getTime() : Number.POSITIVE_INFINITY
  let remaining = 0
  let meetingMinutes = 0
  let allDay = 0
  let proposed = 0

  for (const event of events) {
    if (isAllDay(event)) {
      allDay += 1
      continue
    }
    const start = startMs(event)
    const end = endMs(event)
    if (Number.isNaN(start)) continue
    if (isProposedAgendaEvent(event)) {
      if (end > now.getTime()) proposed += 1
      continue
    }
    if (end > now.getTime()) remaining += 1
    // Relevé en recette live le 14/09/2026 : « 2 rendez-vous à venir · 50 h en
    // réunion » sur une fenêtre de 36 h. Un fournisseur d'agenda (Google,
    // Microsoft) rend un évènement dès qu'il CHEVAUCHE la fenêtre demandée —
    // y compris un bloc commencé bien AVANT `now` (un déplacement, une
    // absence saisie avec une heure plutôt qu'une date nue, donc pas
    // `isAllDay`) ou qui se TERMINE bien APRÈS elle. Sommer depuis son début
    // réel et jusqu'à sa fin réelle comptait aussi le temps déjà écoulé et le
    // temps hors fenêtre, au point de dépasser la fenêtre de 36 h elle-même —
    // la preuve que le nombre ne pouvait pas être vrai. `meetingMinutes`
    // compte ce qu'il RESTE DANS LA FENÊTRE : la borne basse est `now`, la
    // borne haute est `until`, jamais le début ou la fin réels d'un
    // évènement qui déborde de part ou d'autre.
    const countedFrom = Math.max(start, now.getTime())
    const countedTo = Number.isNaN(end) ? NaN : Math.min(end, untilMs)
    if (!Number.isNaN(countedTo) && countedTo > countedFrom)
      meetingMinutes += Math.round((countedTo - countedFrom) / 60_000)
  }

  return { remaining, meetingMinutes, allDay, proposed }
}

/**
 * #2390.16 — le titre affiché d'un évènement. Un créneau privé (`busyOnly`)
 * ne montre QUE « Indisponible » : c'est la seule source de ce libellé, pour
 * qu'aucun écran ne retombe sur un titre vide ou « Sans titre » et ne laisse
 * croire à un oubli plutôt qu'à un choix de confidentialité.
 */
export function agendaEventTitle(
  event: Pick<AgendaEvent, 'summary' | 'busyOnly'>,
  labels: { busy: string; untitled: string },
): string {
  if (event.busyOnly === true) return labels.busy
  return event.summary || labels.untitled
}

/**
 * Théo A today-agenda.A3 — le nombre de « points » d'une carte de la semaine :
 * ce qui demande un geste (conflit) ou une attention (invités externes). Une
 * seule pastille « n points » remplace trois étiquettes qui faisaient trois
 * lignes sur une carte étroite ; le détail vit dans le rendez-vous ouvert.
 * Une salle n'est jamais un invité (`personAttendeesOf`, GA-26).
 */
export function agendaPointsOf(event: AgendaEvent, conflicting: boolean): number {
  const hasExternal = personAttendeesOf(event).some(attendee => attendee.external)
  return (conflicting ? 1 : 0) + (hasExternal ? 1 : 0)
}

/**
 * Théo A today-agenda.A6 — la FORME de la carte : hachures pour ce qui bloque
 * l'agenda sans être un rendez-vous (indisponible, absence), pointillé pour un
 * créneau proposé et pas encore accepté. Décidée par la nature calculée une
 * seule fois (`classifyAgendaObject`), jamais redevinée dans la vue.
 */
export function agendaVisualKind(event: AgendaEvent): 'plain' | 'busy' | 'proposed' {
  const kind = classifyAgendaObject(event)
  if (kind === 'private_busy' || kind === 'out_of_office') return 'busy'
  return kind === 'proposed' ? 'proposed' : 'plain'
}
