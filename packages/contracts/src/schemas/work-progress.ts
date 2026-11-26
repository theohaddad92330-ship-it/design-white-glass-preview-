/**
 * #4611 — LAURA DIT OÙ EN EST LE TRAVAIL LANCÉ, au lieu de le raconter sans donnée.
 *
 * Une seule forme de réponse pour les CINQ familles de travail (#4611.2) : analyses, imports,
 * enrichissements, synchros CRM, rattrapages. L'outil de Laura LIT — il ne lance, ne relance, ne
 * rejoue rien — et la réponse part en carte (#4611.3), jamais en prose rédigée par le modèle.
 *
 * LE CONTRAT TIENT EN TROIS REFUS :
 *  - #4611.4 — un compteur est MESURÉ par sa propre requête, jamais déduit d'un autre par soustraction
 *    (« lancées − rendues = en cours » est interdit : un compteur qu'on ne mesure pas n'est pas calculé).
 *  - #4611.5 — ce qui n'a pas pu être mesuré se NOMME (`measured: false` + sa raison), jamais « 0 »
 *    (gardes GA-18 / GA-19).
 *  - #4611.8 — un lot hors du périmètre de l'appelant rend `lot_unknown` : jamais ses chiffres.
 *
 * Ce que ce contrat ne porte PAS, à dessein : aucune probabilité, aucune estimation de fin (un temps
 * restant ne se donne que s'il est mesuré — rien ici ne le mesure), aucun coût d'accès agrégé entre
 * espaces (garde GA-43).
 */

/** #4611.2 — les cinq familles, dans l'ordre où la carte les rend. Ajouts EN FIN (GA-08). */
/**
 * Lot L6 (#4611 « tout le travail en cours », #4967) — `laura_job` : les jobs composites de Laura
 * (`workflow_runs`, `definition_key = 'laura_job'`) ; `chat_research` : les recherches de conversation
 * qui tournent côté serveur (registre des tours, en mémoire : seul « en cours » s'y mesure).
 */
export const WORK_FAMILIES = [
  'analysis',
  'import',
  'enrichment',
  'crm_sync',
  'catch_up',
  'laura_job',
  'chat_research',
] as const
export type WorkFamily = (typeof WORK_FAMILIES)[number]

/** #4611.1 — les quatre compteurs, chacun MESURÉ par sa propre requête (#4611.4). */
export const WORK_COUNTERS = ['launched', 'done', 'failed', 'running'] as const
export type WorkCounter = (typeof WORK_COUNTERS)[number]

/** Le travail « lancé » dont on parle : les sept derniers jours. Un seul endroit (GA-26). */
export const WORK_PROGRESS_WINDOW_DAYS = 7

/** Combien de raisons d'échec nommées par famille — le compteur `failed`, lui, les compte toutes. */
export const WORK_FAILURES_PER_FAMILY = 5

/** #4611.5 — pourquoi un compteur n'a pas pu être mesuré. Liste fermée : la carte en fait une phrase. */
export const WORK_UNMEASURED_REASONS = ['no_run_ledger', 'read_failed'] as const
export type WorkUnmeasuredReason = (typeof WORK_UNMEASURED_REASONS)[number]

export const WORK_UNMEASURED_REASON_LABELS: Readonly<Record<WorkUnmeasuredReason, string>> = {
  no_run_ledger: 'aucun journal par espace ne tient ce suivi',
  read_failed: 'la lecture a échoué',
}

/**
 * `reasonLabel` voyage AVEC la raison : la phrase est écrite ICI, une fois (GA-26), et le service IA la relaie
 * telle quelle au lieu d'en recopier une jumelle.
 */
export type WorkCounterReading =
  { measured: true; value: number } | { measured: false; reason: WorkUnmeasuredReason; reasonLabel: string }

/** #4611.6 — un échec nommé avec la raison TELLE QUE L'AMONT L'A DONNÉE ; `null` = l'amont n'en a pas donné. */
export interface WorkFailure {
  label: string
  reason: string | null
  at: string | null
}

export interface WorkFamilyProgress {
  family: WorkFamily
  counters: Record<WorkCounter, WorkCounterReading>
  /** Le plus ancien départ du travail compté. `null` = rien de compté, ou non mesuré. */
  since: string | null
  /** Le dernier mouvement connu. `null` = aucun. */
  lastActivityAt: string | null
  failures: WorkFailure[]
}

/**
 * #4611.8 — la réponse. Un lot demandé par identifiant qui n'est pas dans le périmètre de l'appelant
 * (autre espace, hors portefeuille, ou inexistant) rend `lot_unknown` — les trois cas sont
 * INDISTINGUABLES, exprès : distinguer « existe ailleurs » de « n'existe pas » confirmerait l'existence
 * d'un lot d'un autre espace.
 */
export type WorkProgressRead =
  | { kind: 'progress'; readAt: string; windowDays: number; families: WorkFamilyProgress[] }
  | { kind: 'lot_unknown'; lotId: string }

/**
 * #4611.5 — une mesure devient un compteur MESURÉ ou un compteur NOMMÉ non mesuré, jamais « 0 ».
 * `null`, `undefined`, `NaN`, un négatif ou un non-entier ne sont pas des mesures : « 0 » ne sort que
 * d'un `0` réellement compté.
 */
export function counterReading(
  value: number | null | undefined,
  unmeasuredReason: WorkUnmeasuredReason,
): WorkCounterReading {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return { measured: true, value }
  return { measured: false, reason: unmeasuredReason, reasonLabel: WORK_UNMEASURED_REASON_LABELS[unmeasuredReason] }
}

/**
 * #4611.4 — assemble une famille depuis des mesures INDÉPENDANTES. Chaque compteur absent est nommé
 * non mesuré ; aucun n'est calculé à partir des autres.
 */
export function workFamilyProgress(input: {
  family: WorkFamily
  measures: Partial<Record<WorkCounter, number | null>>
  unmeasuredReason: WorkUnmeasuredReason
  since?: string | null
  lastActivityAt?: string | null
  failures?: readonly WorkFailure[]
}): WorkFamilyProgress {
  const counters = Object.fromEntries(
    WORK_COUNTERS.map(counter => [counter, counterReading(input.measures[counter], input.unmeasuredReason)]),
  ) as Record<WorkCounter, WorkCounterReading>
  return {
    family: input.family,
    counters,
    since: input.since ?? null,
    lastActivityAt: input.lastActivityAt ?? null,
    failures: (input.failures ?? []).slice(0, WORK_FAILURES_PER_FAMILY),
  }
}
