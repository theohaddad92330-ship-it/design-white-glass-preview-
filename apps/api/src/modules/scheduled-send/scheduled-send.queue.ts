import type { JobsOptions } from 'bullmq'

/**
 * Théo M2 — envoi programmé — la file DIFFÉRÉE. Un job ne porte que l'identifiant de la ligne : l'état (heure,
 * statut, tentative) vit en base, et le worker le relit à chaque passage — un job resté dans la file après une
 * annulation ou un déplacement d'heure ne fait rien.
 */
export const SCHEDULED_SEND_QUEUE = 'scheduled-message-send'

/** Job `dispatch` : faire partir l'envoi à son heure ; job `proof` : chercher le message dans les éléments envoyés. */
export type ScheduledSendJobData = { scheduledSendId: string }

/**
 * Idempotent par brouillon : UN job de départ par ligne ET par heure, sous un identifiant stable — BullMQ refuse un
 * second job portant le même identifiant. L'heure en fait partie : déplacer l'heure pose un job neuf (l'ancien,
 * retiré au mieux, relirait la ligne et ne ferait rien), sans buter sur un job terminé encore gardé par la file.
 */
export function dispatchJobId(scheduledSendId: string, at: Date): string {
  return `scheduled-send-${scheduledSendId}-${at.getTime()}`
}

export function proofJobId(scheduledSendId: string): string {
  return `scheduled-send-proof-${scheduledSendId}`
}

/**
 * Une reprise AVANT la réservation est sans risque (rien n'est parti) ; APRÈS, la ligne porte `attempted_at` et le
 * passage suivant la classe `unknown` au lieu de renvoyer. Les trois tentatives ne peuvent donc jamais doubler un envoi.
 */
export const SCHEDULED_SEND_DISPATCH_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800 },
}

/** La preuve arrive quand la boîte a rangé le message : quatre regards, espacés, puis l'état dit « pas retrouvé ». */
export const SCHEDULED_SEND_PROOF_OPTIONS: JobsOptions = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 60_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800 },
}

/** Le premier regard dans la boîte, après le départ. */
export const PROOF_FIRST_LOOK_DELAY_MS = 60_000
