import { z } from 'zod'

/**
 * #2171.24 — LES DOCUMENTS D'UNE OPPORTUNITÉ — devis, NDA, contrat cadre — et
 * leur statut. Équivalent, côté opportunité, de `need_document`
 * (`need-document.ts`) : la fiche opportunité n'avait AUCUN moyen de dire
 * « le devis est parti » ou « la NDA est signée » à son propre niveau.
 *
 * ⚠️ PAS de fichier joint dans cette tranche (contrairement à
 * `need_document` depuis le 31/08/2026) : le suivi (kind/name/status) est la
 * plus petite tranche prouvable, l'intégration au stockage (octets, quota,
 * URL signée) reste HORS de ce lot — voir le commentaire de #2951.
 */

/** Liste FERMÉE, la même que `need-document.ts` : un statut texte libre ne
 *  s'agrège jamais. */
export const PROJECT_DOCUMENT_KINDS = ['quote', 'nda', 'master_agreement', 'other'] as const
export const projectDocumentKindSchema = z.enum(PROJECT_DOCUMENT_KINDS)
export type ProjectDocumentKind = (typeof PROJECT_DOCUMENT_KINDS)[number]

export const PROJECT_DOCUMENT_STATUSES = ['draft', 'sent', 'pending', 'signed', 'refused'] as const
export const projectDocumentStatusSchema = z.enum(PROJECT_DOCUMENT_STATUSES)
export type ProjectDocumentStatus = (typeof PROJECT_DOCUMENT_STATUSES)[number]

export const projectDocumentSchema = z.object({
  id: z.string().guid(),
  projectId: z.string().guid(),
  kind: projectDocumentKindSchema,
  name: z.string(),
  status: projectDocumentStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ProjectDocument = z.infer<typeof projectDocumentSchema>

export const projectDocumentsResponseSchema = z.object({ items: z.array(projectDocumentSchema) })
export type ProjectDocumentsResponse = z.infer<typeof projectDocumentsResponseSchema>

/** Sans fichier à défaut, le nom est OBLIGATOIRE — contrairement à
 *  `createNeedDocumentSchema` qui peut retomber sur le nom du fichier. */
export const createProjectDocumentSchema = z
  .object({
    kind: projectDocumentKindSchema,
    name: z.string().trim().min(1).max(255),
  })
  .strict()
export type CreateProjectDocumentInput = z.infer<typeof createProjectDocumentSchema>

export const updateProjectDocumentStatusSchema = z.object({ status: projectDocumentStatusSchema }).strict()
export type UpdateProjectDocumentStatusInput = z.infer<typeof updateProjectDocumentStatusSchema>
