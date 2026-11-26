import { z } from 'zod'

/**
 * Les DOCUMENTS d'un besoin, avec leur statut (dossier du 26/08, image 02 —
 * fiche besoin, section « Documents »).
 *
 * `openNeedRowSchema` (`open-needs.ts`) n'en porte aucun, et `need_document` /
 * `NeedDocument` avaient zéro occurrence dans le dépôt avant ce lot : la fiche
 * ne pouvait dire que ce qui MANQUAIT, jamais ce qui a déjà circulé chez le
 * client — « le devis est parti », « la NDA est signée ».
 *
 * Rattaché au BESOIN, jamais au projet : un projet porte souvent plusieurs
 * rôles (`ProjectNeedsPanel`), et un devis répond à un rôle précis — même
 * raisonnement que `Submission.needId` (`submission.ts`).
 */

/** Les quatre natures observées sur la maquette et leur généralisation. Liste
 *  FERMÉE : un statut texte libre ne s'agrège jamais. */
export const NEED_DOCUMENT_KINDS = ['quote', 'nda', 'master_agreement', 'other'] as const
export const needDocumentKindSchema = z.enum(NEED_DOCUMENT_KINDS)
export type NeedDocumentKind = (typeof NEED_DOCUMENT_KINDS)[number]

/**
 * Le cycle d'un document. `draft` est le défaut ORDINAIRE — rien n'est encore
 * parti — et il n'apparaît pas forcément à l'écran : un document qu'on
 * commence à suivre est déjà en général `sent` ou `pending`.
 */
export const NEED_DOCUMENT_STATUSES = ['draft', 'sent', 'pending', 'signed', 'refused'] as const
export const needDocumentStatusSchema = z.enum(NEED_DOCUMENT_STATUSES)
export type NeedDocumentStatus = (typeof NEED_DOCUMENT_STATUSES)[number]

export const needDocumentSchema = z.object({
  id: z.string().guid(),
  needId: z.string().guid(),
  kind: needDocumentKindSchema,
  name: z.string(),
  status: needDocumentStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type NeedDocument = z.infer<typeof needDocumentSchema>

export const needDocumentsResponseSchema = z.object({ items: z.array(needDocumentSchema) })
export type NeedDocumentsResponse = z.infer<typeof needDocumentsResponseSchema>
