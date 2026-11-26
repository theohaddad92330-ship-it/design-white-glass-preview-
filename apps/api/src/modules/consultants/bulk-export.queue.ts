import type { JobsOptions } from 'bullmq'
import type { BulkExportJobKind } from '@bellum/contracts'

/**
 * Contrat BullMQ de l'export en lot (#1952.6, épopée #2844, lot SRC5 28/09
 * soir). Même patron que `cv-batch-import.queue.ts` : le job Redis ne porte
 * que les identifiants, l'état (progression, fichier fini) vit dans
 * `bulk_export_jobs`.
 */
export const BULK_EXPORT_QUEUE = 'bulk-export'

export type BulkExportJobData = {
  jobId: string
  workspaceId: string
  kind: BulkExportJobKind
}

export const BULK_EXPORT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800 },
}
