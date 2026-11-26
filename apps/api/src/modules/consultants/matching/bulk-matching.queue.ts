import type { JobsOptions } from 'bullmq'

/**
 * Contrat BullMQ du matching massif (#1952.3, épopée #2844, lot SRC5 28/09
 * soir). Même patron que `cv-batch-import.queue.ts` : le job Redis ne porte
 * que les identifiants, l'état (progression, issues) vit dans
 * `bulk_matching_jobs` — c'est CETTE ligne que le worker relit pour reprendre
 * après un crash, jamais un rejeu depuis le premier besoin.
 */
export const BULK_MATCHING_QUEUE = 'bulk-matching'

export type BulkMatchingJobData = {
  jobId: string
  workspaceId: string
  userId: string
  canReadFinance: boolean
}

export const BULK_MATCHING_JOB_OPTIONS: JobsOptions = {
  // Un crash de worker reprend depuis `processed_count` (persisté) — trois
  // tentatives, même borne que `cv-batch-import.queue.ts`.
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800 },
}
