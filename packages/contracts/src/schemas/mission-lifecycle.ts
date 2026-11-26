import { z } from 'zod'
import { consultantAvailabilitySchema } from './consultant.js'
import { missionEndReasonSchema } from './mission-end.js'

/**
 * #4196 (épopée #4191, lot L5) — le CYCLE DE VIE d'une mission : démarrer,
 * prolonger, terminer. Le consultant SUIT la mission (« en mission » au
 * démarrage, disponible à la fin) ; la mission, elle, garde l'historique
 * (statut journalisé, avenant de prolongation).
 */

/**
 * Les statuts où la mission est EN COURS : y entrer met les consultants affectés
 * « en mission », et seuls ces statuts se prolongent ou se terminent. Un seul
 * endroit (GA-26) — l'API et le panneau web le lisent ici.
 */
export const MISSION_RUNNING_STATUSES = ['active', 'at_risk', 'renewal_pending', 'ending'] as const

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ')

/** `POST /delivery/missions/:id/end` — la date de fin RÉELLE et son motif typé. */
export const endMissionInputSchema = z.object({ endedOn: isoDate, reason: missionEndReasonSchema }).strict()
export type EndMissionInput = z.infer<typeof endMissionInputSchema>

/**
 * `POST /delivery/missions/:id/extend` — la nouvelle échéance, le nouveau TJM
 * s'il change, et la PREUVE : aucune prolongation sans pièce (même règle que
 * tout avenant, #2423).
 */
export const extendMissionInputSchema = z
  .object({
    newEndsOn: isoDate,
    newDailyRate: z.number().positive().max(10_000).optional(),
    proof: z.string().trim().min(1).max(2000),
  })
  .strict()
export type ExtendMissionInput = z.infer<typeof extendMissionInputSchema>

/** Ce qui est arrivé à UNE fiche consultant quand la mission a bougé. */
export const CONSULTANT_ENGAGEMENT_OUTCOMES = [
  'written',
  'unchanged',
  'kept_human',
  'other_mission',
  'not_found',
] as const
export const consultantEngagementOutcomeSchema = z.enum(CONSULTANT_ENGAGEMENT_OUTCOMES)
export type ConsultantEngagementOutcome = z.infer<typeof consultantEngagementOutcomeSchema>

export const consultantEngagementResultSchema = z.object({
  consultantId: z.string().guid(),
  outcome: consultantEngagementOutcomeSchema,
  /** La fiche était archivée et ne l'est plus (un consultant en mission n'est jamais archivé). */
  unarchived: z.boolean(),
  availability: consultantAvailabilitySchema.nullable(),
  availableFrom: isoDate.nullable(),
})
export type ConsultantEngagementResult = z.infer<typeof consultantEngagementResultSchema>

/** La réponse commune de « Terminer » et « Prolonger ». */
export const missionLifecycleResultSchema = z.object({
  missionId: z.string().guid(),
  status: z.string(),
  endsOn: isoDate.nullable(),
  consultants: z.array(consultantEngagementResultSchema),
})
export type MissionLifecycleResult = z.infer<typeof missionLifecycleResultSchema>

/**
 * La fiche dit une chose saisie à la main, la mission en dit une autre : on ne
 * tranche pas (l'humain gagne), on NOMME l'écart — `GET /consultants/:id/engagement`.
 */
export const consultantEngagementConflictSchema = z.object({
  consultantId: z.string().guid(),
  missionId: z.string().guid(),
  missionLabel: z.string(),
  endsOn: isoDate.nullable(),
  ficheAvailability: consultantAvailabilitySchema,
  /** Date de la saisie manuelle, ISO. */
  ficheEnteredAt: z.string(),
})
export type ConsultantEngagementConflict = z.infer<typeof consultantEngagementConflictSchema>

/**
 * Disponibilité d'un consultant dont la mission se termine le `endedOn`.
 * Fini aujourd'hui ou avant ⇒ `immediate` ; sinon sous un mois (≤ 31 j), sinon
 * `sous_3_mois`. `available_from` est le LENDEMAIN de la fin.
 */
export function availabilityAfterEnd(
  endedOn: string,
  today: string,
): { availability: 'immediate' | 'sous_1_mois' | 'sous_3_mois'; availableFrom: string } {
  const availableFrom = addDays(endedOn, 1)
  if (endedOn <= today) return { availability: 'immediate', availableFrom }
  const days = Math.round((Date.parse(`${endedOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  return { availability: days <= 31 ? 'sous_1_mois' : 'sous_3_mois', availableFrom }
}

/** `YYYY-MM-DD` + n jours, en UTC (aucun décalage de fuseau sur une date calendaire). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
