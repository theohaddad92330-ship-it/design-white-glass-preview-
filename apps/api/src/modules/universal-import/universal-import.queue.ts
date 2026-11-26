import type { JobsOptions } from 'bullmq'

/**
 * La file BullMQ de l'import universel (Louis 27/09/2026).
 *
 * Le job Redis ne porte QUE deux identifiants — jamais une cellule du fichier :
 * les octets sont au stockage (parts), l'état en base (`universal_import_jobs`).
 * C'est ce qui rend la reprise possible sans rien garder en mémoire Redis, et ce
 * qui garde les données d'import hors des journaux de la file.
 */
export const UNIVERSAL_IMPORT_QUEUE = 'universal-import'

export type UniversalImportJobData = { jobId: string; workspaceId: string }

export const UNIVERSAL_IMPORT_JOB_OPTIONS: JobsOptions = {
  // Un crash de worker ne perd rien : la tentative suivante reprend au dernier
  // paquet VALIDÉ (`committed_rows`). Au-delà des tentatives, le job passe en
  // `failed` — et se REPREND d'un clic, toujours depuis ce même point.
  attempts: 5,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800 },
}
