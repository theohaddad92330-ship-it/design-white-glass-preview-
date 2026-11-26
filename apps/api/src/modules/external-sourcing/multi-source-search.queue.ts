import type { JobsOptions } from 'bullmq'

/**
 * Contrat BullMQ de la recherche multi-sources (#1952.7, épopée #2844, lot
 * SRC5 28/09 soir). Même patron que `cv-batch-import.queue.ts` : le job Redis
 * ne porte que les identifiants, l'état (progression, candidats classés) vit
 * dans `multi_source_search_jobs`.
 */
export const MULTI_SOURCE_SEARCH_QUEUE = 'multi-source-search'

export type MultiSourceSearchJobData = {
  jobId: string
  workspaceId: string
  userId: string
  needId: string
  maxPerSource?: number
}

export const MULTI_SOURCE_SEARCH_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800 },
}
