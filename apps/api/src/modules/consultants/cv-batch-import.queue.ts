import type { JobsOptions } from 'bullmq'
import type { CvBatchImportJobKind } from '@bellum/contracts'

/**
 * Contrat BullMQ de l'import de CV en masse (#2326.12, épopée #2794).
 *
 * Le payload complet (les octets de chaque fichier) voyage dans les données du
 * job Redis, PAS dans `cv_batch_import_jobs` — la ligne persistée ne porte que
 * l'ÉTAT (progression, issues, erreur), relu par l'écran. C'est ce que le
 * worker relit pour reprendre : `entries` reste dans Redis tant que le job n'a
 * pas atteint `removeOnComplete`/`removeOnFail`, et `processed_count` en base
 * dit exactement où reprendre — jamais un rejeu depuis le premier fichier.
 */
export const CV_BATCH_IMPORT_QUEUE = 'cv-batch-import'

export type CvBatchImportEntry = {
  filename: string
  fileB64: string
  /** Millisecondes epoch — jamais `Date` : les données d'un job BullMQ passent par `JSON.stringify`. */
  capturedAtMs: number | null
}

export type CvBatchImportJobData = {
  jobId: string
  workspaceId: string
  userId: string
  kind: CvBatchImportJobKind
  entries: CvBatchImportEntry[]
}

export type CvBatchImportJobResult = { ok: true; processed: number } | { ok: false; reason: string }

export const CV_BATCH_IMPORT_JOB_OPTIONS: JobsOptions = {
  // Un crash de worker ne doit pas perdre le lot : le job REPREND depuis
  // `processed_count` (persisté), jamais depuis zéro — trois tentatives
  // suffisent à couvrir un restart d'instance sans redoubler indéfiniment.
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800 },
}
