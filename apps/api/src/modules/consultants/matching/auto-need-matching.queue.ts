import type { JobsOptions } from 'bullmq'

/**
 * #2916 / #2399.2 — le job du matching AUTOMATIQUE d'un besoin entrant
 * (`c93_matching_auto_besoin_entrant`).
 *
 * ⚠️ PAS DE FILE NEUVE : le job passe par la file `bulk-matching` existante
 * (`BULK_MATCHING_QUEUE`), sous un NOM distinct, et c'est son worker qui le
 * route. Un worker de plus ajouterait un créneau de concurrence au pool
 * Postgres que le cliquet GA-303 (`database.module.spec.ts`) refuse de relever
 * pour passer — et le travail est le même : un classement par besoin, un à la
 * fois.
 */
export const AUTO_NEED_MATCH_JOB = 'auto-need-match'

export type AutoNeedMatchJobData = {
  needId: string
  workspaceId: string
  /** Le membre qui a activé la routine — l'auteur attribué du run. */
  userId: string
}

export const AUTO_NEED_MATCH_JOB_OPTIONS: JobsOptions = {
  // Une VRAIE erreur (base indisponible) est réessayée ; un délai dépassé ne
  // l'est jamais — il rend `unknown` sans lever (doctrine c14).
  attempts: 3,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: { age: 86_400, count: 5_000 },
  removeOnFail: { age: 604_800 },
}

/**
 * Le délai au-delà duquel l'issue devient `unknown`. Un classement lit le
 * vivier entier ; une minute couvre largement un vivier de plusieurs milliers
 * de profils — au-delà, c'est la base qui ne répond pas, pas le calcul.
 */
export const AUTO_NEED_MATCH_TIMEOUT_MS = 60_000

/**
 * Un job par BESOIN : deux mises en file du même besoin partagent le même job.
 * ⚠️ AUCUN `:` — BullMQ l'utilise comme séparateur de clés Redis.
 */
export function autoNeedMatchJobId(needId: string): string {
  return `auto-need-match-${needId}`
}
