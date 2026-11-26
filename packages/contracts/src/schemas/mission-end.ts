import { z } from 'zod'

/**
 * #2414 (LAU-FINAL-128) / épopée #2986 — fin de mission : motif typé, checklist
 * de sortie, mission interrompue. Même patron que {@link
 * import('./mission-start-readiness.js')} (#2338/#2409) : un catalogue en
 * CODE (GA-26), des gestes DÉCLARÉS avec leur auteur et leur date, jamais
 * recalculés. Différence assumée : ceci n'est PAS une porte — rien ne bloque
 * la mission de finir tant que la checklist est incomplète, l'épopée demande
 * une checklist visible, pas un gate (à la différence de #2338/#2409).
 */

// ── Motif de fin (8 valeurs, #2414.1 à .8) ─────────────────────────────────

export const MISSION_END_REASONS = [
  'date_prevue',
  'renouvellement_refuse',
  'interruption',
  'remplacement',
  'demission',
  'fin_budget',
  'mauvais_fit',
  'fin_projet',
] as const
export type MissionEndReason = (typeof MISSION_END_REASONS)[number]
export const missionEndReasonSchema = z.enum(MISSION_END_REASONS)

export const missionEndReasonInputSchema = z.object({ reason: missionEndReasonSchema })
export type MissionEndReasonInput = z.infer<typeof missionEndReasonInputSchema>

// ── Checklist de sortie (client / consultant / interne) ────────────────────

export const MISSION_END_CHECK_ITEMS = [
  // CLIENT — #2414.11/.13/.16
  { key: 'client_handover', group: 'client' },
  { key: 'client_documents', group: 'client' },
  { key: 'client_payment', group: 'client' },
  // CONSULTANT — #2414.18 à .23
  { key: 'consultant_mobility', group: 'consultant' },
  { key: 'consultant_daily_rate', group: 'consultant' },
  { key: 'consultant_preferences', group: 'consultant' },
  { key: 'consultant_cv_updated', group: 'consultant' },
  { key: 'consultant_consent', group: 'consultant' },
  { key: 'consultant_other_processes', group: 'consultant' },
  // INTERNE — #2414.29/.31/.32/.33
  { key: 'internal_actions', group: 'internal' },
  { key: 'internal_references', group: 'internal' },
  { key: 'internal_equipment', group: 'internal' },
  { key: 'internal_documents', group: 'internal' },
] as const
export type MissionEndCheckKey = (typeof MISSION_END_CHECK_ITEMS)[number]['key']
export type MissionEndCheckGroup = (typeof MISSION_END_CHECK_ITEMS)[number]['group']

/**
 * Les 13 clés, à plat — c'est cette liste, et pas {@link MISSION_END_CHECK_ITEMS},
 * que reprend la contrainte SQL `mission_end_checks_item_key_check` (GA-12) : une
 * liste d'objets mêlerait ses clés `group` aux `key` dans la contrainte. Un
 * test (`mission-end.test.ts`) vérifie que les deux listes restent alignées.
 */
export const MISSION_END_CHECK_KEYS = [
  'client_handover',
  'client_documents',
  'client_payment',
  'consultant_mobility',
  'consultant_daily_rate',
  'consultant_preferences',
  'consultant_cv_updated',
  'consultant_consent',
  'consultant_other_processes',
  'internal_actions',
  'internal_references',
  'internal_equipment',
  'internal_documents',
] as const satisfies readonly MissionEndCheckKey[]

/** Un geste humain enregistré (non archivé) — jamais recalculé. */
export interface MissionEndDeclared {
  key: MissionEndCheckKey
  confirmedAt: string
  confirmedBy: string
  note: string
}

type MissionEndItemState = 'done' | 'missing'

export interface MissionEndCheckItem {
  key: MissionEndCheckKey
  group: MissionEndCheckGroup
  state: MissionEndItemState
  confirmedAt: string | null
  confirmedBy: string | null
  note: string | null
}

/** Trois issues, jamais une probabilité — pas de « à moitié fait ». */
export type MissionEndChecklistVerdict = 'not_started' | 'in_progress' | 'complete'

export interface MissionEndChecklist {
  verdict: MissionEndChecklistVerdict
  /** Les items COCHÉS, dans l'ordre du catalogue — jamais un simple compte. */
  done: MissionEndCheckItem[]
  /** Les items qui manquent, NOMMÉS — une checklist incomplète ne se lit jamais « 0 ». */
  missing: MissionEndCheckKey[]
  items: MissionEndCheckItem[]
}

export function computeMissionEndChecklist(input: { declared: readonly MissionEndDeclared[] }): MissionEndChecklist {
  const items: MissionEndCheckItem[] = MISSION_END_CHECK_ITEMS.map(def => {
    const row = input.declared.find(d => d.key === def.key)
    if (!row)
      return { key: def.key, group: def.group, state: 'missing', confirmedAt: null, confirmedBy: null, note: null }
    return {
      key: def.key,
      group: def.group,
      state: 'done',
      confirmedAt: row.confirmedAt,
      confirmedBy: row.confirmedBy,
      note: row.note,
    }
  })
  const done = items.filter(i => i.state === 'done')
  const missing = items.filter(i => i.state === 'missing').map(i => i.key)
  const verdict: MissionEndChecklistVerdict =
    done.length === 0 ? 'not_started' : missing.length === 0 ? 'complete' : 'in_progress'
  return { verdict, done, missing, items }
}

/** #2414 — cocher un item de sortie exige une note (rien ne se coche en silence). */
export const missionEndCheckInputSchema = z.object({
  item: z.enum(MISSION_END_CHECK_KEYS),
  note: z.string().trim().min(3).max(500),
})
export type MissionEndCheckInput = z.infer<typeof missionEndCheckInputSchema>

// ── Mission interrompue (#2414.54 à .59, NO-GO) ─────────────────────────────

/** Qui porte la responsabilité de l'interruption — jamais devinée, toujours déclarée. */
export const MISSION_INTERRUPTION_RESPONSIBILITIES = ['client', 'consultant', 'esn', 'partage'] as const
export type MissionInterruptionResponsibility = (typeof MISSION_INTERRUPTION_RESPONSIBILITIES)[number]

export const MISSION_INTERRUPTION_RISKS = ['faible', 'moyen', 'eleve'] as const
export type MissionInterruptionRisk = (typeof MISSION_INTERRUPTION_RISKS)[number]

/**
 * #2414 NO-GO — « Le consultant devient automatiquement disponible à la date
 * théorique sans revalidation ni prise en compte du renouvellement. » Cette
 * forme ne porte donc JAMAIS de champ disponibilité : une interruption se
 * DÉCLARE d'abord (motif, responsabilités, risque, les deux accusés), la
 * disponibilité se REVALIDE ensuite, par un second geste humain distinct
 * ({@link missionAvailabilityRevalidationInputSchema}). Les fondre en un seul
 * geste referait exactement l'automatisme que le NO-GO interdit.
 */
export const missionInterruptionInputSchema = z.object({
  responsibility: z.enum(MISSION_INTERRUPTION_RESPONSIBILITIES),
  risk: z.enum(MISSION_INTERRUPTION_RISKS),
  /** Un accusé de réception, pas une case cochée par défaut : les deux sont requis. */
  confidentialityAcknowledged: z.literal(true),
  nonSolicitationAcknowledged: z.literal(true),
  note: z.string().trim().min(20).max(2000),
})
export type MissionInterruptionInput = z.infer<typeof missionInterruptionInputSchema>

export interface MissionInterruption {
  id: string
  missionId: string
  responsibility: MissionInterruptionResponsibility
  risk: MissionInterruptionRisk
  confidentialityAcknowledged: true
  nonSolicitationAcknowledged: true
  note: string
  /** `false` tant qu'aucun second geste humain ne l'a revalidée (NO-GO). */
  availabilityConfirmed: boolean
  availabilityConfirmedAt: string | null
  availabilityConfirmedBy: string | null
  declaredBy: string
  declaredAt: string
}

/** #2414 NO-GO — le second geste, séparé, qui seul peut lever `availabilityConfirmed`. */
export const missionAvailabilityRevalidationInputSchema = z.object({
  confirmed: z.literal(true),
})
export type MissionAvailabilityRevalidationInput = z.infer<typeof missionAvailabilityRevalidationInputSchema>
