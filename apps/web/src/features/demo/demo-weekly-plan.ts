import type {
  FocusPlan,
  FocusPlanBlock,
  FocusPlanTeamPolicy,
  FocusPlanToolFamily,
  FocusPlanUnreadSource,
  FocusWeekPlan,
  PendingChatAction,
} from '@bellum/contracts'

/**
 * #2770 (recette prod 03/10) — LE PLAN DE SEMAINE DE LAURA, EN SALLE DE DÉMONSTRATION.
 *
 * Craft rule n°9 : la carte « Plan de la semaine » (`WeeklyPlanCard`) que Laura rend en
 * production sur « Organise-moi ma semaine… » ne se voyait nulle part en salle (recette
 * 02/10 et 03/10 : « carte non atteinte »). La question de la recette est désormais une
 * amorce ; sa réponse porte la carte, sur les comptes RÉELLEMENT semés (SNCF, Société
 * Générale, Groupe BPCE).
 *
 * Mêmes règles que le moteur réel (`chat_tools.py::_build_weekly_plan`) : jamais un jour
 * passé, jamais après l'échéance (« avant jeudi » = le jeudi, inclus), une marge toujours
 * laissée, aucun rendez-vous déplacé. Un vendredi ou un week-end, on vise la semaine
 * SUIVANTE : le plan ne tombe jamais sur une échéance déjà dépassée. Les dates se calculent
 * au tour : une date en dur vieillirait. La salle n'écrit rien (`useIsDemo`).
 */
const TIME_ZONE = 'Europe/Paris'
const DAY_MS = 86_400_000
/** Libre supposé par jour de la salle : 7 h 30, dont la capacité n'est jamais consommée en entier. */
const FREE_MINUTES_PER_DAY = 450
const BUFFER_MINUTES = 5
const DAY_START_MINUTE = 10 * 60
const DAY_END_MINUTE = 18 * 60

/**
 * #2770.35/.37 (décision Louis 11/10) — ce que le plan de la salle a LU, comme en production
 * (`chat_tools.py::_attach_plan_inputs`) : les outils branchés de la salle (agenda et messagerie
 * de démonstration) et LA politique d'équipe semée côté API (`DEMO_TEAM_POLICY`,
 * `apps/api/src/modules/demo/demo-dataset.ts`, ici en snake_case). Ses plages tombent hors de
 * la journée planifiée (10 h – 18 h) : la carte la respecte sans moteur. Seul le rôle reste non
 * lu (c76, #2770.36 NO-GO).
 */
const DEMO_PLAN_CONNECTED_TOOLS: FocusPlanToolFamily[] = ['calendar', 'email']
export const DEMO_PLAN_TEAM_POLICY: FocusPlanTeamPolicy = {
  prospecting_windows: [{ start_minute: 510, end_minute: 600 }],
  forbidden_windows: [
    // #2770.37 — « 12:00–14:00 (lun.) » : la pause déjeuner du lundi, une plage PAR JOUR (ISO 1 = lundi).
    { start_minute: 720, end_minute: 840, weekdays: [1] },
    { start_minute: 1080, end_minute: 1200 },
  ],
  max_meetings_per_day: 4,
  daily_call_target: 20,
}
const DEMO_PLAN_UNREAD_SOURCES: FocusPlanUnreadSource[] = ['role']

function demoPlanInputs() {
  return {
    connected_tools: [...DEMO_PLAN_CONNECTED_TOOLS],
    team_policy: DEMO_PLAN_TEAM_POLICY,
    unread_sources: [...DEMO_PLAN_UNREAD_SOURCES],
  }
}

type LocalDay = { date: string; isoWeekday: number }

function localDay(now: Date): LocalDay {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now)
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    isoWeekday: weekdays.indexOf(get('weekday')) + 1,
  }
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** L'instant UTC d'une heure LOCALE de Paris — heure d'été ou d'hiver, sans offset en dur. */
function parisInstant(date: string, minuteOfDay: number): Date {
  const guess = Date.parse(`${date}T00:00:00Z`) + minuteOfDay * 60_000
  const shown = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(guess))
  const hour = Number(shown.find(part => part.type === 'hour')?.value ?? 0)
  const minute = Number(shown.find(part => part.type === 'minute')?.value ?? 0)
  return new Date(guess + (minuteOfDay - (hour * 60 + minute)) * 60_000)
}

function block(
  type: FocusPlanBlock['type'],
  title: string,
  duration: number,
  reason: string,
  priority: FocusPlanBlock['priority'],
  deadline: string | null,
): Omit<FocusPlanBlock, 'start_iso' | 'end_iso'> {
  return {
    type,
    title,
    duration_minutes: duration,
    priority_reason: reason,
    priority,
    deadline,
    context: null,
    collision: null,
  }
}

/** Jour ISO (1 = lundi … 7 = dimanche) d'une date AAAA-MM-JJ. */
function isoWeekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay() || 7
}

/** #2770.37 — les créneaux interdits qui valent CE jour (une plage sans `weekdays` vaut chaque jour). */
function forbiddenToday(date: string): { start_minute: number; end_minute: number }[] {
  const weekday = isoWeekdayOf(date)
  return DEMO_PLAN_TEAM_POLICY.forbidden_windows.filter(w => w.weekdays === undefined || w.weekdays.includes(weekday))
}

/** Minutes interdites ce jour-là dans [from, to) — ce que la marge ne peut pas compter comme libre. */
function forbiddenMinutes(date: string, from: number, to: number): number {
  return forbiddenToday(date).reduce(
    (sum, w) => sum + Math.max(0, Math.min(to, w.end_minute) - Math.max(from, w.start_minute)),
    0,
  )
}

function dayPlan(
  date: string,
  blocks: ReturnType<typeof block>[],
  startMinute = DAY_START_MINUTE,
  freeMinutes = FREE_MINUTES_PER_DAY,
): FocusPlan {
  let cursor = startMinute
  const placed: FocusPlanBlock[] = blocks.map(entry => {
    // #2770.37 — un bloc ne chevauche jamais un créneau interdit du jour : il repart à la fin de la plage.
    for (const w of forbiddenToday(date)) {
      if (cursor < w.end_minute && w.start_minute < cursor + entry.duration_minutes) cursor = w.end_minute
    }
    const start = parisInstant(date, cursor)
    const end = new Date(start.getTime() + entry.duration_minutes * 60_000)
    cursor += entry.duration_minutes + BUFFER_MINUTES
    return { ...entry, start_iso: start.toISOString(), end_iso: end.toISOString() }
  })
  const used = blocks.reduce((sum, entry) => sum + entry.duration_minutes, 0)
  return {
    date,
    time_zone: TIME_ZONE,
    energy: null,
    blocks: placed,
    deferred_blocks: [],
    margin_minutes: Math.max(0, freeMinutes - used - forbiddenMinutes(date, startMinute, DAY_END_MINUTE)),
  }
}

export function demoWeeklyPlan(now: Date = new Date()): FocusWeekPlan {
  const today = localDay(now)
  const monday = addDays(today.date, 1 - today.isoWeekday)
  // Vendredi, samedi, dimanche : la semaine suivante. Sinon : d'aujourd'hui à vendredi.
  const nextWeek = today.isoWeekday >= 5
  const weekStart = nextWeek ? addDays(monday, 7) : monday
  const firstOffset = nextWeek ? 0 : today.isoWeekday - 1
  const days = [0, 1, 2, 3, 4].slice(firstOffset).map(offset => addDays(weekStart, offset))
  // « Avant jeudi » : le jeudi de la semaine planifiée, inclus (même sémantique que l'outil réel).
  const deadline = addDays(weekStart, 3)

  const relanceDays = days.slice(0, Math.max(1, days.length - 1)).filter(day => day <= deadline)
  const relances = [
    ['Relancer SNCF sur le point en attente', 'Le rendez-vous de la semaine dernière attend son compte rendu'],
    ['Relancer Société Générale sur les profils', 'Deux profils promis en réunion, en retard'],
    ['Relancer Groupe BPCE sur le renfort', 'L’angle renfort a été présenté, sans retour'],
  ] as const
  const byDay = new Map<string, ReturnType<typeof block>[]>()
  relances.forEach(([title, reason], index) => {
    const day = relanceDays[index % relanceDays.length] ?? days[0] ?? weekStart
    byDay.set(day, [...(byDay.get(day) ?? []), block('follow_ups', title, 30, reason, 'high', deadline)])
  })
  const lastDay = days.at(-1) ?? weekStart
  byDay.set(lastDay, [
    ...(byDay.get(lastDay) ?? []),
    block('pipeline_review', 'Revue de pipe de la semaine', 45, 'Faire le point avant le week-end', 'normal', null),
  ])

  const planned = days.filter(day => byDay.has(day)).map(day => dayPlan(day, byDay.get(day) ?? []))
  return {
    week_start: weekStart,
    time_zone: TIME_ZONE,
    energy: null,
    days: planned,
    deferred_blocks: [],
    margin_minutes: planned.reduce((sum, day) => sum + day.margin_minutes, 0),
    // #2770.35/.36/.37 — ce que le plan a lu, comme l'outil de production.
    ...demoPlanInputs(),
  }
}

export function demoWeeklyPlanAction(now: Date = new Date()): PendingChatAction {
  return { action: 'propose_weekly_plan', cost_credits: 0, plan: demoWeeklyPlan(now) }
}

/** Minutes écoulées depuis minuit, heure de Paris. */
function parisMinuteOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  return (
    Number(parts.find(part => part.type === 'hour')?.value ?? 0) * 60 +
    Number(parts.find(part => part.type === 'minute')?.value ?? 0)
  )
}

/**
 * #2770.69 — LE PLAN DE JOURNÉE EN SALLE : « Organise-moi ma journée » rend la vraie `FocusPlanCard`,
 * horodatée, sur les comptes semés. Mêmes règles que `chat_tools.py::_build_focus_plan` : jamais un bloc
 * dans le passé (le premier part au quart d'heure qui suit), un tampon entre deux blocs, une marge laissée.
 * Si ce qui reste de la journée (10 h–18 h) ne tient plus les blocs, le plan vise le lendemain.
 */
export function demoDayPlan(now: Date = new Date()): FocusPlan {
  const blocks = [
    block(
      'follow_ups',
      'Relancer SNCF, Société Générale et Groupe BPCE',
      60,
      'Trois points en attente de réponse',
      'high',
      null,
    ),
    block('pipeline_review', 'Revue de pipe', 45, 'Mettre à jour les affaires avant la fin de semaine', 'normal', null),
    block(
      'manager_review',
      'Point d’équipe sur les affaires en cours',
      30,
      'Arbitrer les priorités avec l’équipe',
      'normal',
      null,
    ),
  ]
  const needed = blocks.reduce((sum, entry) => sum + entry.duration_minutes, 0) + BUFFER_MINUTES * (blocks.length - 1)
  const today = localDay(now).date
  const nextQuarter = Math.ceil((parisMinuteOfDay(now) + 15) / 15) * 15
  const start = Math.max(DAY_START_MINUTE, nextQuarter)
  const [date, startMinute] = start + needed <= DAY_END_MINUTE ? [today, start] : [addDays(today, 1), DAY_START_MINUTE]
  return {
    ...dayPlan(date, blocks, startMinute, DAY_END_MINUTE - startMinute),
    ...demoPlanInputs(),
  }
}

export function demoDayPlanAction(now: Date = new Date()): PendingChatAction {
  return { action: 'propose_focus_plan', cost_credits: 0, plan: demoDayPlan(now) }
}
