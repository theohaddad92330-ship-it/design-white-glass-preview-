import { z } from 'zod'

/**
 * Théo A signaux.N2 / signaux-veilles.N1 — LA BIBLIOTHÈQUE D'INFORMATIONS PAR COMPTE (`/signals`).
 *
 * Trois choses vivent ici, et elles ne vivent qu'ici (GA-26) :
 *  · l'ÉTAT personnel d'un signal (enregistré · écarté · corbeille) — jamais une suppression : « on
 *    archive, on ne supprime pas », la corbeille se vide en remettant le signal dans la bibliothèque ;
 *  · la VEILLE par compte (comptes, natures, sujets, cadence) ;
 *  · la PRÉVISION de la prochaine échéance, calculée d'une date de départ et d'une cadence réelles.
 */

/** Les trois états qu'un utilisateur donne à un signal. `null` (aucune ligne) = « dans la bibliothèque ». */
export const SIGNAL_USER_STATES = ['saved', 'discarded', 'trashed'] as const
export type SignalUserState = (typeof SIGNAL_USER_STATES)[number]

/** La longueur maximale de la clé d'un signal — bornée, jamais un texte libre sans limite en base. */
const SIGNAL_STATE_KEY_MAX = 300

/**
 * La clé d'un signal pour son état : le FAIT, normalisé. L'identifiant du flux (`<compte>-signal-<rang>`) change
 * à chaque ré-analyse ; le fait, lui, ne change pas — un signal enregistré le reste après un rafraîchissement.
 */
export function signalStateKey(label: string): string {
  return label.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, SIGNAL_STATE_KEY_MAX)
}

const signalStateTargetSchema = z.object({
  account_id: z.string().guid(),
  signal_key: z.string().trim().min(1).max(SIGNAL_STATE_KEY_MAX),
})

/** `PUT /signal-states` — donne un état (ou, avec `null`, remet dans la bibliothèque) à un lot de signaux. */
export const signalStateRequestSchema = z.object({
  items: z.array(signalStateTargetSchema).min(1).max(200),
  state: z.enum(SIGNAL_USER_STATES).nullable(),
})
export type SignalStateRequest = z.infer<typeof signalStateRequestSchema>

const signalStateItemSchema = signalStateTargetSchema.extend({
  state: z.enum(SIGNAL_USER_STATES),
  updated_at: z.string(),
})

/** `GET /signal-states` — les signaux auxquels CET utilisateur a donné un état. */
export const signalStatesResponseSchema = z.object({ items: z.array(signalStateItemSchema) })
export type SignalStatesResponse = z.infer<typeof signalStatesResponseSchema>

/**
 * Les cadences d'une veille, en jours. La cadence règle la FRÉQUENCE DES ALERTES, jamais un appel payant :
 * chaque passage relit ce que la collecte commune a déjà ramené (décision 18/10, veille sans achat).
 */
export const SIGNAL_WATCH_CADENCE_KEYS = ['daily', '3_days', '5_days', 'weekly', 'biweekly', '30_days'] as const
export type SignalWatchCadence = (typeof SIGNAL_WATCH_CADENCE_KEYS)[number]
const SIGNAL_WATCH_CADENCE_DAYS: Record<SignalWatchCadence, number> = {
  daily: 1,
  '3_days': 3,
  '5_days': 5,
  weekly: 7,
  biweekly: 14,
  '30_days': 30,
}
export const SIGNAL_WATCH_CADENCES = SIGNAL_WATCH_CADENCE_KEYS.map(key => ({
  key,
  days: SIGNAL_WATCH_CADENCE_DAYS[key],
}))

/** Les dix natures de signal de Théo (T4) — alignées sur la taxonomie du produit, jamais écrasées. */
export const SIGNAL_NATURES = [
  'press',
  'project',
  'hiring',
  'field',
  'history',
  'need',
  'tender',
  'award',
  'nomination',
  'investment',
] as const
export type SignalNature = (typeof SIGNAL_NATURES)[number]

/** signaux-veilles.A1 — le canal d'alerte d'une veille (gardé : e-mail · dans l'app · digest). */
export const SIGNAL_WATCH_CHANNELS = ['in_app', 'email', 'digest'] as const
export type SignalWatchChannel = (typeof SIGNAL_WATCH_CHANNELS)[number]

export const SIGNAL_WATCH_STATES = ['active', 'paused'] as const
export type SignalWatchState = (typeof SIGNAL_WATCH_STATES)[number]

/** `POST|PATCH /signal-watches` — une veille : quels comptes, quelles natures (aucune = toutes), quels sujets, quel rythme. */
export const watchRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  account_ids: z.array(z.string().guid()).min(1).max(50),
  natures: z.array(z.enum(SIGNAL_NATURES)).max(SIGNAL_NATURES.length),
  keywords: z.array(z.string().trim().min(1).max(80)).max(20),
  cadence: z.enum(SIGNAL_WATCH_CADENCE_KEYS),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().trim().min(1).max(64),
  channel: z.enum(SIGNAL_WATCH_CHANNELS),
  /** signaux-veilles.A1 — partager la veille avec l'espace : les autres membres la LISENT, seul son auteur la règle. */
  shared: z.boolean(),
})
export type WatchRequest = z.infer<typeof watchRequestSchema>

/** `PATCH /signal-watches/:id/state` — mettre en pause / reprendre. */
export const watchStateRequestSchema = z.object({ state: z.enum(SIGNAL_WATCH_STATES) })

const watchAccountSchema = z.object({
  account_id: z.string().guid(),
  company_name: z.string(),
  /** La veille ne relit que les comptes SUIVIS (4267.1) : un compte non suivi se dit, et se suit en un geste. */
  followed: z.boolean(),
})

export const watchItemSchema = watchRequestSchema.omit({ account_ids: true }).extend({
  id: z.string().guid(),
  state: z.enum(SIGNAL_WATCH_STATES),
  /** Vrai pour l'auteur : seul lui règle, met en pause ou supprime. */
  mine: z.boolean(),
  accounts: z.array(watchAccountSchema),
  /** Prévision calculée (`nextWatchRunOn`) ; `null` = en pause, ou date de départ illisible. */
  next_run_on: z.string().nullable(),
  created_at: z.string(),
})
export type WatchItem = z.infer<typeof watchItemSchema>

/** `GET /signal-watches`. */
export const watchesResponseSchema = z.object({
  items: z.array(watchItemSchema),
  /** Le plafond de suivi, dit à côté des veilles : « n/5 suivis ». */
  follow_max: z.number().int().positive(),
  followed_count: z.number().int().nonnegative(),
})
export type WatchesResponse = z.infer<typeof watchesResponseSchema>

const DAY_MS = 86_400_000
const parseDay = (day: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const ms = Date.parse(`${day}T00:00:00Z`)
  return Number.isNaN(ms) ? null : ms
}

/**
 * La prochaine échéance prévue d'une veille : la date de départ, puis tous les `cadenceDays` jours, jamais dans le
 * passé. Calcul de CALENDRIER pur (jours entiers) — aucune heure inventée. Date illisible → `null`, jamais une date devinée.
 */
export function nextWatchRunOn(startsOn: string, cadenceDays: number, today: string): string | null {
  const start = parseDay(startsOn)
  const now = parseDay(today)
  if (start === null || now === null || cadenceDays <= 0) return null
  if (start >= now) return startsOn
  const elapsed = Math.ceil((now - start) / DAY_MS / cadenceDays)
  return new Date(start + elapsed * cadenceDays * DAY_MS).toISOString().slice(0, 10)
}
