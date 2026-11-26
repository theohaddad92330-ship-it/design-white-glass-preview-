import { z } from 'zod'
import { hasEnoughSessionsToPublish } from './product-analytics-privacy.js'

/**
 * #2386.9 — LA TÉLÉMÉTRIE DE LA SESSION DE PROSPECTION, PAR PARCOURS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PORTE, ET POURQUOI ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * #2386 demande quatre mesures : temps jusqu'au premier message, taux de
 * messages modifiés, taux de succès connecteur, doublons évités. Jusqu'ici
 * (#2386.9/#3010.8), « doublons évités » se comptait EN MÉMOIRE, dans le
 * dialogue — rien n'était persisté, donc rien ne pouvait s'agrégater d'une
 * session à l'autre. Ce fichier ajoute la forme PERSISTÉE (`prospecting_sessions`,
 * migration `apps/api/src/migrations`) et le CALCUL pur de l'agrégat — jamais
 * l'inverse : le calcul est ici, dans `@bellum/contracts`, parce que l'API
 * (ce qu'elle CALCULE) et le web (ce qu'il AFFICHE) en ont besoin tous les
 * deux, même raison que `product-analytics-privacy.ts` juste à côté.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « PAR PARCOURS, JAMAIS PAR PERSONNE » (GA-240/241/264/266/267)
 * ─────────────────────────────────────────────────────────────────────────────
 * `journey` est la clé d'agrégation — un des modes de `PROSPECTING_SESSION_MODES`
 * (apps/web, TEXT libre côté contrat et base : même raison que
 * `commercial_audit_feedback.target_key`, les modes vivent dans le code de
 * l'écran). Aucune fonction de ce fichier n'accepte ni ne rend un identifiant
 * de commercial : `ProspectingSessionRecord` ne porte PAS de `user_id`, et
 * `aggregateProspectingSessionMetrics` groupe par `journey` seul. Le plancher
 * `hasEnoughSessionsToPublish` (`product-analytics-privacy.ts`, RÉUTILISÉ —
 * pas une seconde valeur, GA-26) protège les trois métriques DÉRIVÉES (moyennes,
 * taux) d'un parcours trop rare pour dire quoi que ce soit ; `duplicatesAvoided`
 * reste un COMPTE brut, publié quel que soit le volume — même choix que
 * `ProspectingSessionDialog.tsx` avant persistance.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « NON MESURÉ » N'EST JAMAIS 0 (GA-18/GA-19)
 * ─────────────────────────────────────────────────────────────────────────────
 * `null` sur les trois métriques dérivées veut dire « pas assez de sessions »
 * OU « aucune n'a encore ce fait » (ex. aucun message envoyé) — jamais une
 * moyenne de zéro. L'écran doit lire `null` comme « non mesuré », jamais «0».
 */

export const prospectingSessionRecordSchema = z.object({
  journey: z.string().min(1),
  startedAt: z.string(),
  firstMessageAt: z.string().nullable(),
  messagesTotal: z.number().int().min(0),
  messagesModified: z.number().int().min(0),
  connectorAttempts: z.number().int().min(0),
  connectorSuccesses: z.number().int().min(0),
  duplicatesAvoided: z.number().int().min(0),
})
export type ProspectingSessionRecord = z.infer<typeof prospectingSessionRecordSchema>

export const prospectingSessionMetricSchema = z.object({
  journey: z.string(),
  sessions: z.number().int(),
  /** Moyenne, en secondes. `null` = non mesuré (plancher non atteint, ou aucune session n'a de premier message). */
  timeToFirstMessageSeconds: z.number().nullable(),
  /** `null` = non mesuré (plancher non atteint, ou aucun message envoyé sur ce parcours). */
  modifiedMessageRate: z.number().nullable(),
  /** `null` = non mesuré (plancher non atteint, ou aucune tentative connecteur). */
  connectorSuccessRate: z.number().nullable(),
  duplicatesAvoided: z.number().int(),
})
export type ProspectingSessionMetric = z.infer<typeof prospectingSessionMetricSchema>

export const prospectingSessionMetricsResponseSchema = z.object({
  metrics: z.array(prospectingSessionMetricSchema),
})
export type ProspectingSessionMetricsResponse = z.infer<typeof prospectingSessionMetricsResponseSchema>

export const startProspectingSessionRequestSchema = z.object({
  journey: z.string().min(1),
})
export type StartProspectingSessionRequest = z.infer<typeof startProspectingSessionRequestSchema>

export const startProspectingSessionResponseSchema = z.object({ id: z.string().guid() })
export type StartProspectingSessionResponse = z.infer<typeof startProspectingSessionResponseSchema>

export const recordProspectingSessionEventRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('first_message') }),
  z.object({ kind: z.literal('message_sent'), modified: z.boolean() }),
  z.object({ kind: z.literal('connector_attempt'), success: z.boolean() }),
  z.object({ kind: z.literal('duplicates_avoided'), count: z.number().int().min(0) }),
])
export type RecordProspectingSessionEventRequest = z.infer<typeof recordProspectingSessionEventRequestSchema>

function secondsBetween(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * L'agrégat PAR PARCOURS — jamais par session isolée, jamais par personne
 * (aucun champ `user_id` en entrée). Pure : aucun appel réseau, aucune
 * horloge lue — `now` n'existe pas ici, seuls les horodatages DÉJÀ écrits
 * comptent.
 */
export function aggregateProspectingSessionMetrics(
  sessions: readonly ProspectingSessionRecord[],
): ProspectingSessionMetric[] {
  const byJourney = new Map<string, ProspectingSessionRecord[]>()
  for (const session of sessions) {
    const group = byJourney.get(session.journey) ?? []
    group.push(session)
    byJourney.set(session.journey, group)
  }

  return [...byJourney.entries()].map(([journey, group]) => {
    const enoughToPublish = hasEnoughSessionsToPublish(group.length)

    const timeToFirstMessages = group.flatMap(session =>
      session.firstMessageAt ? [secondsBetween(session.startedAt, session.firstMessageAt)] : [],
    )
    const messagesTotal = group.reduce((sum, session) => sum + session.messagesTotal, 0)
    const messagesModified = group.reduce((sum, session) => sum + session.messagesModified, 0)
    const connectorAttempts = group.reduce((sum, session) => sum + session.connectorAttempts, 0)
    const connectorSuccesses = group.reduce((sum, session) => sum + session.connectorSuccesses, 0)
    const duplicatesAvoided = group.reduce((sum, session) => sum + session.duplicatesAvoided, 0)

    return {
      journey,
      sessions: group.length,
      timeToFirstMessageSeconds: enoughToPublish ? average(timeToFirstMessages) : null,
      modifiedMessageRate: enoughToPublish && messagesTotal > 0 ? messagesModified / messagesTotal : null,
      connectorSuccessRate: enoughToPublish && connectorAttempts > 0 ? connectorSuccesses / connectorAttempts : null,
      duplicatesAvoided,
    }
  })
}
