import type { JobsOptions } from 'bullmq'

/**
 * #4158.57 — le rapatriement d'un espace personnel, UN job par demande validée. Le job ne porte que
 * l'identifiant de la demande et l'empreinte validée ; l'état vit en base (`workspace_merge_requests`,
 * journal `workspace_merge_items`), ce qui rend une reprise sûre après une coupure.
 */
export const WORKSPACE_MERGE_QUEUE = 'workspace-merge'

export type WorkspaceMergeJobData = {
  requestId: string
  hash: string
  /** Toujours explicite : sans lui, le job ne fait qu'une simulation. */
  write: boolean
}

export const WORKSPACE_MERGE_JOB_OPTIONS: JobsOptions = {
  // Une coupure (redéploiement, base indisponible) se reprend où elle s'est arrêtée : le journal
  // ligne à ligne évite toute double copie.
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800 },
}
