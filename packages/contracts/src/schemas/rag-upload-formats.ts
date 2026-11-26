/**
 * #3751 — LES FORMATS ET LE PLAFOND DU DÉPÔT DE DOCUMENT, UNE SEULE FOIS (GA-26).
 *
 * Avant ce lot, le trombone du chat (`ATTACH_EXTENSIONS`, 8 Mo) et l'écran
 * Connaissances (`.pdf,.txt,.md,.csv,.json`, « 9 Mo » en dur) décrivaient le MÊME
 * chemin d'ingestion (`POST /rag-documents/ingest`) avec deux listes et deux
 * plafonds : docx/xlsx/pptx ne passaient que par le chat, et 9 Mo bruts font
 * ~12,6 Mo en base64, au-dessus du plafond de 12 Mo de l'API.
 */

/** Les documents lus par le serveur (`document_text.py`) — le socle commun du chat et de Connaissances. */
export const RAG_UPLOAD_DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'md', 'csv', 'json'] as const

/** Lues par le modèle, pas d'OCR local : propres au chemin éphémère du chat. */
export const RAG_UPLOAD_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const

/** Dépliée côté serveur (`RagZipIngestService`) : propre au chat. */
export const RAG_UPLOAD_ARCHIVE_EXTENSIONS = ['zip'] as const

/**
 * #3623.8 — « tout type de fichier » : les textes usuels d'un dossier de recherche (export tableur
 * tabulé, journal, XML, YAML). Lus en UTF-8 côté client et ingérés comme du texte brut (`content`),
 * donc sans extracteur serveur à deviner. Propres au trombone de /search : Connaissances et le chat
 * gardent leur liste. Un binaire (exécutable, image, base) reste refusé avec sa raison.
 */
export const RAG_UPLOAD_ANALYSIS_TEXT_EXTENSIONS = ['tsv', 'log', 'xml', 'yaml', 'yml'] as const

/**
 * #3623 — ce que le trombone de /search joint à UNE analyse : les documents, les textes usuels ET
 * les archives (dépliées côté serveur). Pas d'images : le chemin éphémère du chat les lit, pas la base.
 */
export const RAG_UPLOAD_ANALYSIS_EXTENSIONS = [
  ...RAG_UPLOAD_DOCUMENT_EXTENSIONS,
  ...RAG_UPLOAD_ANALYSIS_TEXT_EXTENSIONS,
  ...RAG_UPLOAD_ARCHIVE_EXTENSIONS,
] as const

/** Tout ce que le trombone du chat accepte, dans l'ordre historique de son sélecteur. */
export const RAG_UPLOAD_CHAT_EXTENSIONS = [
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  ...RAG_UPLOAD_IMAGE_EXTENSIONS,
  'txt',
  'md',
  'csv',
  'json',
  ...RAG_UPLOAD_ARCHIVE_EXTENSIONS,
] as const

/** Plafond d'un fichier BRUT (~8 Mo) : une fois en base64 (+~33 %), le corps reste sous le plafond de 12 Mo de l'API. */
export const RAG_UPLOAD_MAX_BYTES = 8_000_000

/** Les extensions texte, lues en UTF-8 côté client (le reste part en base64 pour extraction serveur). */
export const RAG_UPLOAD_TEXT_EXTENSIONS = ['txt', 'md', 'csv', 'json'] as const

/** L'extension en minuscules, sans point — `''` quand il n'y en a pas. */
export function ragUploadExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

const isTextExtension = (ext: string): boolean =>
  (RAG_UPLOAD_TEXT_EXTENSIONS as readonly string[]).includes(ext) ||
  (RAG_UPLOAD_ANALYSIS_TEXT_EXTENSIONS as readonly string[]).includes(ext)

type RagUploadVerdict = { ok: true; isText: boolean } | { ok: false; reason: 'unsupported' | 'too_large' | 'empty' }

/** Le verdict AVANT envoi : jamais un fichier refusé en silence, jamais un envoi voué à l'échec. */
export function validateRagUpload(
  file: { name: string; size: number },
  allowed: readonly string[] = RAG_UPLOAD_DOCUMENT_EXTENSIONS,
): RagUploadVerdict {
  const ext = ragUploadExtension(file.name)
  if (!allowed.includes(ext)) return { ok: false, reason: 'unsupported' }
  if (file.size <= 0) return { ok: false, reason: 'empty' }
  if (file.size > RAG_UPLOAD_MAX_BYTES) return { ok: false, reason: 'too_large' }
  return { ok: true, isText: isTextExtension(ext) }
}
