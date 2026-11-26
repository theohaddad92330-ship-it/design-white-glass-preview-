import { z } from 'zod'
import { sniffCvFileKind } from './cv-batch-import.js'

/**
 * #4034 — le CV ORIGINAL est conservé, et se relit par une URL signée.
 *
 * Renversement assumé (Louis 12/10/2026, « je veux voir le fichier, l'aperçu du
 * CV ajouté ») de la règle « on garde le texte, jamais le fichier » : l'écran
 * Documents ne savait dire que « nom · CV · N caractères ». Le binaire vit
 * désormais dans le seau PRIVÉ du stockage, rangé sous l'espace, et ne sort
 * que par une URL signée de courte durée, fabriquée côté serveur après le
 * contrôle de droit sur le document parent.
 */

/** #4034.3 — durée de vie d'une URL signée d'aperçu (≤ 5 min). */
export const TALENT_DOCUMENT_FILE_URL_TTL_SECONDS = 300

/** #4034.2 — un nom de fichier qui ne peut pas sortir de son dossier. #4573 — partagé avec l'original d'un pack. */
export function safeStorageName(filename: string, fallback = 'cv'): string {
  const base = filename.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._]+/, '')
    .slice(-120)
  return cleaned.length > 0 ? cleaned : fallback
}

/** #4034.2 — `<workspace_id>/cv/<document_id>/<nom>` : le cloisonnement porté par le chemin. */
export function cvOriginalStoragePath(workspaceId: string, documentId: string, filename: string): string {
  return `${workspaceId}/cv/${documentId}/${safeStorageName(filename)}`
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  txt: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/** #4034.2 — le type du fichier : les OCTETS d'abord, l'extension ensuite, jamais deviné au-delà. */
export function cvOriginalMimeType(filename: string, bytes: Uint8Array): string {
  const sniffed = sniffCvFileKind(bytes)
  if (sniffed === 'pdf') return 'application/pdf'
  if (sniffed === 'docx') return MIME_BY_EXTENSION['docx'] as string
  const dot = filename.lastIndexOf('.')
  const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream'
}

/** #4034.4 — PDF en cadre, image en image ; DOCX/RTF/DOC se téléchargent (aucun navigateur ne les rend). */
export function talentDocumentPreviewMode(mimeType: string | null): 'frame' | 'image' | 'download' {
  if (mimeType === 'application/pdf') return 'frame'
  if (mimeType?.startsWith('image/')) return 'image'
  return 'download'
}

/** #4034.3 — la réponse de `GET /talents/:id/documents/:documentId/file-url`. */
export const talentDocumentFileUrlSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string(),
  mimeType: z.string().nullable(),
  filename: z.string(),
})
export type TalentDocumentFileUrl = z.infer<typeof talentDocumentFileUrlSchema>

/** #4034.4/.5 — le texte extrait d'un document, mis en page dans l'aperçu. */
export const talentDocumentTextSchema = z.object({
  text: z.string(),
  partial: z.boolean(),
})
export type TalentDocumentText = z.infer<typeof talentDocumentTextSchema>
