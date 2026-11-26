import type { JobsOptions } from 'bullmq'
import type { RagDocumentScope } from '@bellum/contracts'

/**
 * #3623.11 / #3666.10 — la file de l'ingestion d'une archive .zip. Le dépaquetage
 * (CPU + mémoire) ne tourne plus dans la requête API (incident du 05/10/2026) :
 * la requête met l'archive en file et rend un identifiant, le worker dépaquette.
 */
export const RAG_ZIP_INGEST_QUEUE = 'rag-zip-ingest'

export type RagZipIngestJobData = {
  workspaceId: string
  userId: string
  fileB64: string
  filename: string
  category?: string
  scope?: RagDocumentScope
  conversationId?: string
  accountId?: string
}

export const RAG_ZIP_INGEST_JOB_OPTIONS: JobsOptions = {
  // Jamais de retry automatique : rejouer une archive entière referait tout le
  // travail d'extraction (même posture que `cv-zip-import`). La reprise est
  // un geste explicite, sans double traitement (dédoublonnage par contenu côté IA).
  attempts: 1,
  // Le résultat survit au polling de l'écran et à un retour sur la page.
  removeOnComplete: { age: 86_400, count: 200 },
  removeOnFail: { age: 86_400 },
}
