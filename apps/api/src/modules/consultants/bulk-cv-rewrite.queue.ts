import type { JobsOptions } from 'bullmq'

/**
 * Contrat BullMQ de la réécriture de CV en lot (#1952.5, épopée #2844, lot
 * SRC5 28/09 soir). Même patron que `bulk-matching.queue.ts` : le job Redis
 * ne porte que les identifiants, l'état (progression, issues) vit dans
 * `bulk_cv_rewrite_jobs`.
 */
export const BULK_CV_REWRITE_QUEUE = 'bulk-cv-rewrite'

export type BulkCvRewriteJobData = {
  jobId: string
  workspaceId: string
  userId: string
}

export const BULK_CV_REWRITE_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800 },
}
