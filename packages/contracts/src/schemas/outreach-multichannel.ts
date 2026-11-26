import type { OutreachStepKind, OutreachStepStatus } from './outreach-sequence.js'

/**
 * Lot L-B (#4165, épopée #4163) — le SOCLE multicanal des séquences : jours
 * ouvrés, saut LinkedIn, exclusions à l'inscription, pause vacances, stats par
 * étape. Que des fonctions PURES (horloge en paramètre) : l'API et le web
 * partagent le même calcul, aucun des deux ne le réécrit (GA-26).
 */

/* ------------------------------ issues déclarées ----------------------------- */

/**
 * L'issue d'une invitation LinkedIn, DÉCLARÉE à la main par le commercial :
 * Bellum ne lit jamais LinkedIn, il ne sait donc pas si l'invitation a été
 * acceptée — il le tient pour « non accepté » tant qu'on ne le lui a pas dit.
 */
export const OUTREACH_LINKEDIN_INVITE_OUTCOMES = ['accepted', 'pending'] as const

/** L'issue d'un appel : joint / messagerie / pas de réponse. */
export const OUTREACH_CALL_OUTCOMES = ['reached', 'voicemail', 'no_answer'] as const

/** Quelles issues une nature d'étape accepte ; `[]` = aucune issue à déclarer. */
export function outreachOutcomesForKind(kind: OutreachStepKind): readonly string[] {
  if (kind === 'linkedin_invite') return OUTREACH_LINKEDIN_INVITE_OUTCOMES
  if (kind === 'call') return OUTREACH_CALL_OUTCOMES
  return []
}

/* -------------------------------- jours ouvrés ------------------------------- */

/**
 * L'unité d'un délai. `business_days` pour toute NOUVELLE séquence ;
 * `calendar_days` pour l'existant — aucun changement silencieux d'une cadence
 * déjà armée.
 */
export const OUTREACH_DELAY_UNITS = ['business_days', 'calendar_days'] as const
export type OutreachDelayUnit = (typeof OUTREACH_DELAY_UNITS)[number]
export const OUTREACH_DEFAULT_DELAY_UNIT: OutreachDelayUnit = 'business_days'

const DAY_MS = 86_400_000

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay()
  return day === 0 || day === 6
}

/** Reporte un samedi/dimanche au lundi suivant (heure conservée). */
function toBusinessDay(date: Date): Date {
  const out = new Date(date.getTime())
  while (isWeekend(out)) out.setUTCDate(out.getUTCDate() + 1)
  return out
}

/** `n` jours OUVRÉS après `from` (samedi et dimanche sautés ; heure conservée).
 *  Zéro jour un week-end glisse au lundi. */
export function addBusinessDays(from: Date, n: number): Date {
  const out = toBusinessDay(from)
  let left = Math.max(0, Math.trunc(n))
  while (left > 0) {
    out.setUTCDate(out.getUTCDate() + 1)
    if (!isWeekend(out)) left -= 1
  }
  return out
}

/** L'échéance d'un délai `n` dans son unité. Les jours calendaires restent
 *  bruts : le glissement de week-end historique (#2378.4) appartient à l'API. */
export function dueAtForDelay(anchor: Date, n: number, unit: OutreachDelayUnit): Date {
  return unit === 'business_days' ? addBusinessDays(anchor, n) : new Date(anchor.getTime() + n * DAY_MS)
}

/* ------------------------- saut LinkedIn (invitation) ------------------------ */

/** Ce que ces fonctions lisent d'une étape — le sous-ensemble commun à l'entité
 *  (API) et au DTO (web). */
type GateStep = {
  id: string
  position: number
  kind: OutreachStepKind
  status: OutreachStepStatus
  due_at: string
  payload: Record<string, unknown>
}

/**
 * Pour une étape `linkedin_message` : l'invitation qui la précède a-t-elle été
 * acceptée ?
 *  - `null`                  — pas une étape message, ou aucune invitation avant elle ;
 *  - `'accepted'`            — l'invitation précédente est déclarée acceptée ;
 *  - `'awaiting_acceptance'` — sinon (pas d'issue déclarée = pas acceptée).
 *
 * Séquence LINÉAIRE : l'invitation visée est la plus proche AVANT le message, il
 * n'y a pas de branche oui/non.
 */
export function linkedinGateFor(steps: readonly GateStep[], step: GateStep): 'accepted' | 'awaiting_acceptance' | null {
  if (step.kind !== 'linkedin_message') return null
  const invite = [...steps]
    .filter(candidate => candidate.kind === 'linkedin_invite' && candidate.position < step.position)
    .sort((a, b) => b.position - a.position)[0]
  if (!invite) return null
  return invite.payload['outcome'] === 'accepted' ? 'accepted' : 'awaiting_acceptance'
}

/** Les étapes `linkedin_message` EN ATTENTE à SAUTER : échues et toujours non
 *  acceptées. Rend les `id`, dans l'ordre des positions. */
export function linkedinStepsToSkip(steps: readonly GateStep[], now: Date): string[] {
  return [...steps]
    .sort((a, b) => a.position - b.position)
    .filter(
      step =>
        step.kind === 'linkedin_message' &&
        step.status === 'pending' &&
        new Date(step.due_at).getTime() <= now.getTime() &&
        linkedinGateFor(steps, step) === 'awaiting_acceptance',
    )
    .map(step => step.id)
}

/* --------------------------- exclusions à l'inscription ---------------------- */

export const OUTREACH_RECENT_CONTACT_DAYS = 30

export const OUTREACH_ENROLLMENT_EXCLUSION_CODES = [
  'active_sequence',
  'recently_contacted',
  'rgpd_opposition',
  'already_client',
] as const
type OutreachEnrollmentExclusionCode = (typeof OUTREACH_ENROLLMENT_EXCLUSION_CODES)[number]

export type OutreachEnrollmentExclusion = {
  code: OutreachEnrollmentExclusionCode
  /** L'utilisateur peut-il passer outre ? JAMAIS pour le RGPD. */
  forceable: boolean
}

/**
 * Les raisons de NE PAS inscrire un contact, nommées une à une.
 *
 * `alreadyClient: null` = l'information n'existe pas dans le modèle pour ce
 * compte : on ne la devine pas, elle n'exclut rien.
 */
export function evaluateEnrollmentExclusions(input: {
  hasActiveSequence: boolean
  /** Dernier message ENVOYÉ à ce contact, ou `null`. */
  lastSentAt: Date | null
  /** Effacement / opposition RGPD. */
  erased: boolean
  alreadyClient: boolean | null
  now: Date
}): OutreachEnrollmentExclusion[] {
  const out: OutreachEnrollmentExclusion[] = []
  if (input.hasActiveSequence) out.push({ code: 'active_sequence', forceable: true })
  if (input.lastSentAt && input.now.getTime() - input.lastSentAt.getTime() < OUTREACH_RECENT_CONTACT_DAYS * DAY_MS) {
    out.push({ code: 'recently_contacted', forceable: true })
  }
  if (input.erased) out.push({ code: 'rgpd_opposition', forceable: false })
  if (input.alreadyClient === true) out.push({ code: 'already_client', forceable: true })
  return out
}

/** Ce qui bloque encore l'inscription : tout, sauf le forçable quand l'utilisateur force. */
export function blockingEnrollmentExclusions(
  exclusions: readonly OutreachEnrollmentExclusion[],
  forced: boolean,
): OutreachEnrollmentExclusion[] {
  return exclusions.filter(exclusion => !exclusion.forceable || !forced)
}

/* ------------------------------- pause vacances ------------------------------ */

/**
 * La nouvelle échéance après une pause : décalée de la DURÉE de la pause (pas
 * de rattrapage en rafale). En jours ouvrés, un décalage tombant un week-end
 * glisse au lundi. Une étape déjà en retard à la pause repart à la reprise.
 */
export function shiftDueAfterPause(due: Date, pausedAt: Date, resumedAt: Date, unit: OutreachDelayUnit): Date {
  const pause = resumedAt.getTime() - pausedAt.getTime()
  if (pause <= 0) return due
  let shifted = new Date(due.getTime() + pause)
  if (shifted.getTime() < resumedAt.getTime()) shifted = new Date(resumedAt.getTime())
  return unit === 'business_days' ? toBusinessDay(shifted) : shifted
}

/** Une séquence en pause vacances est « due à la reprise » quand la date est atteinte. */
export function vacationResumeDue(until: Date | null, now: Date): boolean {
  return until !== null && until.getTime() <= now.getTime()
}

/* --------------------------------- stats d'étape ------------------------------ */

type OutreachStepStatsRow = {
  position: number
  kind: OutreachStepKind
  /** Étapes posées à cette position, sautées exclues. `null` = aucune. */
  prepared: number | null
  /** Étapes faites (envoyées, ou « faites » pour un appel). `null` = rien de préparé. */
  done: number | null
  /** Contacts qui ont répondu après CETTE étape (la dernière faite). `null` = non mesurable. */
  replied: number | null
  /** RDV pris après CETTE étape. `null` = non mesurable. */
  meeting: number | null
}

type StatsSequence = {
  steps: readonly { position: number; kind: OutreachStepKind; status: OutreachStepStatus }[]
  contact_replied: boolean
  cancel_reason?: string | null
}

/**
 * Préparé · fait · répondu · RDV, par position d'étape. Pas d'ouvertures, pas
 * de probabilité. Une valeur NON MESURÉE est `null` (« — »), jamais 0 : tant
 * qu'aucune étape n'est faite à une position, répondre ou prendre RDV « après
 * elle » n'a pas de sens.
 *
 * Une réponse (ou un RDV) est attribuée à la DERNIÈRE étape faite de sa
 * séquence : c'est celle qui a précédé la réponse.
 */
export function computeSequenceStepStats(sequences: readonly StatsSequence[]): OutreachStepStatsRow[] {
  const rows = new Map<
    number,
    { kind: OutreachStepKind; prepared: number; done: number; replied: number; meeting: number }
  >()
  const row = (position: number, kind: OutreachStepKind) => {
    const existing = rows.get(position)
    if (existing) return existing
    const fresh = { kind, prepared: 0, done: 0, replied: 0, meeting: 0 }
    rows.set(position, fresh)
    return fresh
  }
  for (const sequence of sequences) {
    for (const step of sequence.steps) {
      const entry = row(step.position, step.kind)
      if (step.status !== 'skipped') entry.prepared += 1
      if (step.status === 'done') entry.done += 1
    }
    const lastDone = [...sequence.steps]
      .filter(step => step.status === 'done')
      .sort((a, b) => b.position - a.position)[0]
    if (lastDone) {
      const entry = row(lastDone.position, lastDone.kind)
      if (sequence.cancel_reason === 'meeting_booked') entry.meeting += 1
      if (sequence.contact_replied) entry.replied += 1
    }
  }
  return [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([position, entry]) => {
      if (entry.prepared === 0) {
        return { position, kind: entry.kind, prepared: null, done: null, replied: null, meeting: null }
      }
      const measurable = entry.done > 0
      return {
        position,
        kind: entry.kind,
        prepared: entry.prepared,
        done: entry.done,
        replied: measurable ? entry.replied : null,
        meeting: measurable ? entry.meeting : null,
      }
    })
}

/* ------------------------------ délai affiché ------------------------------- */

/** Combien de jours OUVRÉS séparent `from` de `to` (week-ends exclus). `from` ≥ `to` → 0. */
export function businessDaysBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0
  let count = 0
  // Un point de départ de week-end vaut le lundi suivant — comme `addBusinessDays`,
  // dont c'est la réciproque : J+0 d'un samedi est le lundi.
  const cursor = toBusinessDay(from)
  while (cursor.getTime() < to.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    if (cursor.getTime() <= to.getTime() && !isWeekend(cursor)) count += 1
  }
  return count
}

/* ------------------------ variables avec valeur de repli --------------------- */

const STEP_VARIABLE = /\{\{\s*([\w.]+)\s*(?:\|([^}]*))?\}\}/g

/** Les variables d'un texte d'étape : `{{nom}}` ou `{{nom|valeur de repli}}`. */
export function parseStepVariables(text: string): { name: string; fallback: string | null }[] {
  const seen = new Map<string, { name: string; fallback: string | null }>()
  for (const match of text.matchAll(STEP_VARIABLE)) {
    const name = match[1] as string
    if (seen.has(name)) continue
    const fallback = match[2]?.trim()
    seen.set(name, { name, fallback: fallback ? fallback : null })
  }
  return [...seen.values()]
}

/**
 * Remplace les variables par leur valeur, à défaut par leur repli. Une variable
 * sans valeur NI repli est VIDE : elle est signalée (`empty`) et rendue vide —
 * jamais un `{{prenom}}` littéral dans un message (même règle que #3756.3).
 */
export function resolveStepVariables(
  text: string,
  values: Readonly<Record<string, string | null | undefined>>,
): { text: string; empty: string[]; usedFallback: string[] } {
  const empty = new Set<string>()
  const usedFallback = new Set<string>()
  const resolved = text.replace(STEP_VARIABLE, (_whole, name: string, fallback: string | undefined) => {
    const value = values[name]?.trim()
    if (value) return value
    const backup = fallback?.trim()
    if (backup) {
      usedFallback.add(name)
      return backup
    }
    empty.add(name)
    return ''
  })
  return { text: resolved, empty: [...empty], usedFallback: [...usedFallback] }
}
