import type { JobsOptions } from 'bullmq'

/**
 * #3065 (lot 2b) — le DISPATCHER de l'import ZIP volumineux : une archive
 * trop grande pour voyager en base64 dans un corps JSON (`CvBatchImportService.importZip`)
 * part directement vers le stockage (URL signée d'upload), puis CETTE file
 * porte le traitement — l'API la lit en STREAMING et traite les CV un par un,
 * jamais tous en mémoire.
 */
export const CV_ZIP_IMPORT_QUEUE = 'cv-zip-import'

/** Payload d'un job — juste assez pour retrouver l'objet déposé et reprendre
 *  le MÊME pipeline automatique que l'import en ligne (`CvIntakeService.intakeAutomatic`). */
export type CvZipImportJobData = {
  workspaceId: string
  userId: string
  /** Le chemin de l'objet dans le stockage — rendu par le ticket d'upload. */
  path: string
  /** Le nom D'ORIGINE de l'archive, pour le rapport de fin. */
  filename: string
}

export const CV_ZIP_IMPORT_JOB_OPTIONS: JobsOptions = {
  // JAMAIS de retry automatique : une archive de plusieurs centaines de
  // mégaoctets relancée en entier coûterait à nouveau tout le streaming — même
  // posture que le dispatcher d'envoi outreach (#3069) et l'enrichissement à
  // la demande.
  attempts: 1,
  // Le résultat doit survivre au polling de l'écran pendant tout le
  // traitement (plusieurs minutes pour un lot de centaines de fichiers).
  removeOnComplete: { age: 86_400, count: 200 },
  removeOnFail: { age: 86_400 },
}
