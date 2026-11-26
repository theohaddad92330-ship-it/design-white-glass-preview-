import { z } from 'zod'
import { ragUploadExtension } from './rag-upload-formats.js'

/**
 * #3803 — L'APERÇU FIDÈLE D'UN DOCUMENT DÉPOSÉ (07/10/2026).
 *
 * Retour Louis : « je veux que ça m'ouvre au format classeur […] là ça fait
 * pas pro ». L'aperçu montrait le TEXTE extrait (lignes tabulées pour un
 * classeur). Depuis ce lot, l'ORIGINAL est conservé (domaine de stockage
 * `rag_document_source`) et l'écran choisit une visionneuse par format.
 *
 * Un document déposé AVANT ce changement n'a pas d'original (il n'a jamais
 * été gardé, aucun rattrapage possible) : `source` vaut `null`, et l'écran
 * montre le texte en le DISANT (« original non conservé »).
 */

/** Les visionneuses — une par famille de format, jamais par fournisseur. */
const RAG_PREVIEW_KINDS = ['spreadsheet', 'pdf', 'document', 'slides', 'text'] as const
export type RagPreviewKind = (typeof RAG_PREVIEW_KINDS)[number]

const PREVIEW_KIND_BY_EXTENSION: Readonly<Record<string, RagPreviewKind>> = {
  xlsx: 'spreadsheet',
  csv: 'spreadsheet',
  pdf: 'pdf',
  docx: 'document',
  pptx: 'slides',
  md: 'text',
  txt: 'text',
  json: 'text',
}

/** La visionneuse d'un original, décidée sur son EXTENSION. `null` = aucune. */
export function ragPreviewKind(fileName: string): RagPreviewKind | null {
  return PREVIEW_KIND_BY_EXTENSION[ragUploadExtension(fileName)] ?? null
}

/** L'original conservé, tel que l'écran le connaît — jamais son chemin. */
const ragDocumentSourceSchema = z.object({
  fileName: z.string(),
  contentType: z.string(),
  byteSize: z.number().int().positive(),
})

/**
 * Ce que `GET /rag-documents/:id` rend : le texte (toujours), et l'original
 * quand il existe. `source` est TOUJOURS présent — `null` dit « non
 * conservé », jamais une clé absente qu'on confondrait avec un vieux serveur.
 */
export const ragDocumentPreviewSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  content: z.string().nullable(),
  category: z.string().nullable(),
  source: ragDocumentSourceSchema.nullable(),
})
export type RagDocumentPreview = z.infer<typeof ragDocumentPreviewSchema>
