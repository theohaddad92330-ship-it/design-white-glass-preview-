/**
 * #2770.37 — LA POLITIQUE D'ÉQUIPE, saisie par le manager (décision Louis 11/10 :
 * « construis tout ce qu'il faut »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE EST, ET OÙ ELLE VIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Un réglage d'ESPACE — une ligne `workspace_team_policy_settings` par espace,
 * créée au premier enregistrement — écrit sous `team:manage` (Réglages › Équipe)
 * et lu par Laura quand elle organise une journée ou une semaine
 * (`propose_focus_plan` / `propose_weekly_plan`, `chat_tools.py`). Ce n'est PAS
 * le temps protégé PERSONNEL (`protected-time.ts`, les heures de travail d'une
 * personne) : ici, ce sont les règles que l'équipe se donne. Les deux coexistent,
 * chacun à un seul endroit (GA-26).
 *
 * Quatre règles, rien d'autre :
 * - `prospectingWindows` — plages PROTÉGÉES pour la prospection : pas de réunion,
 *   seuls les blocs de prospection (appels, recherche, enrichissement, relances)
 *   y sont proposés ;
 * - `forbiddenWindows` — créneaux INTERDITS : aucun bloc n'y est proposé ;
 * - `maxMeetingsPerDay` — plafond de réunions par jour, comparé aux réunions
 *   RÉELLES de l'agenda ;
 * - `dailyCallTarget` — objectif d'appels par jour, rappelé quand le plan ne
 *   contient aucune session d'appels.
 *
 * Une plage vaut pour chaque jour, sauf si elle nomme ses `weekdays` (#2770.37 —
 * « le jour + les heures » : ISO 1 = lundi … 7 = dimanche). Heures en minutes depuis
 * minuit dans le fuseau applicable de la personne. `null` / liste vide = « non saisi », jamais 0
 * (GA-18/GA-19) : un plafond à zéro se dit en effaçant la règle.
 */
import { z } from 'zod'

/** Au plus quatre plages par liste — une politique d'équipe se lit d'un coup d'œil. */
export const TEAM_POLICY_WINDOWS_MAX = 4
export const TEAM_POLICY_MAX_MEETINGS_BOUNDS = { min: 1, max: 12 } as const
export const TEAM_POLICY_DAILY_CALLS_BOUNDS = { min: 1, max: 200 } as const

const teamPolicyWindowSchema = z
  .object({
    /** Minutes depuis minuit — 540 = 9 h 00. */
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    /** Jours ISO (1 = lundi … 7 = dimanche) où la plage vaut ; ABSENT = chaque jour, jamais une liste vide. */
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .refine(days => new Set(days).size === days.length, { message: 'jours en double' })
      .optional(),
  })
  .strict()
  .refine(({ startMinute, endMinute }) => endMinute > startMinute, {
    message: 'endMinute doit être strictement après startMinute',
  })
export type TeamPolicyWindow = z.infer<typeof teamPolicyWindowSchema>

const teamPolicyWindowsSchema = z.array(teamPolicyWindowSchema).max(TEAM_POLICY_WINDOWS_MAX)

const teamPolicyFields = {
  prospectingWindows: teamPolicyWindowsSchema,
  forbiddenWindows: teamPolicyWindowsSchema,
  maxMeetingsPerDay: z
    .number()
    .int()
    .min(TEAM_POLICY_MAX_MEETINGS_BOUNDS.min)
    .max(TEAM_POLICY_MAX_MEETINGS_BOUNDS.max)
    .nullable(),
  dailyCallTarget: z
    .number()
    .int()
    .min(TEAM_POLICY_DAILY_CALLS_BOUNDS.min)
    .max(TEAM_POLICY_DAILY_CALLS_BOUNDS.max)
    .nullable(),
}

/** Une plage vaut-elle ce jour ISO ? Sans `weekdays`, chaque jour. */
function teamPolicyWindowApplies(window: TeamPolicyWindow, isoWeekday: number): boolean {
  return window.weekdays === undefined || window.weekdays.includes(isoWeekday)
}

/**
 * Deux plages qui se recouvrent (dans une liste ou d'une liste à l'autre) sont une règle
 * contradictoire — SI elles valent un même jour : lundi 10-11 h et mardi 10-11 h ne se touchent pas.
 */
export function teamPolicyWindowsOverlap(windows: readonly TeamPolicyWindow[]): boolean {
  return windows.some((a, i) =>
    windows.some(
      (b, j) =>
        j > i &&
        a.startMinute < b.endMinute &&
        b.startMinute < a.endMinute &&
        [1, 2, 3, 4, 5, 6, 7].some(day => teamPolicyWindowApplies(a, day) && teamPolicyWindowApplies(b, day)),
    ),
  )
}

export const teamPolicySchema = z
  .object(teamPolicyFields)
  .strict()
  .refine(policy => !teamPolicyWindowsOverlap([...policy.prospectingWindows, ...policy.forbiddenWindows]), {
    message: 'deux plages de la politique d’équipe se chevauchent',
  })
export type TeamPolicy = z.infer<typeof teamPolicySchema>

/** `PATCH /workspaces/team-policy` — un champ omis ne bouge pas ; la politique FUSIONNÉE est revalidée. */
export const updateTeamPolicySchema = z.object(teamPolicyFields).partial().strict()
export type UpdateTeamPolicy = z.infer<typeof updateTeamPolicySchema>

/** L'état « rien saisi » — la réponse d'un espace sans ligne. */
export const EMPTY_TEAM_POLICY: TeamPolicy = {
  prospectingWindows: [],
  forbiddenWindows: [],
  maxMeetingsPerDay: null,
  dailyCallTarget: null,
}

/** Une politique est SAISIE dès qu'une règle porte une valeur. */
export function isTeamPolicySet(policy: TeamPolicy): boolean {
  return (
    policy.prospectingWindows.length > 0 ||
    policy.forbiddenWindows.length > 0 ||
    policy.maxMeetingsPerDay !== null ||
    policy.dailyCallTarget !== null
  )
}

/** « HH:MM » (champ `type="time"`, ou « 24:00 » pour minuit en fin de plage) → minutes ; illisible → `null`. */
export function parseTeamPolicyMinute(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const minutes = Number(match[1]) * 60 + Number(match[2])
  if (Number(match[2]) > 59 || minutes > 1440) return null
  return minutes
}

/** Minutes depuis minuit → « HH:MM ». */
export function formatTeamPolicyMinute(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}
