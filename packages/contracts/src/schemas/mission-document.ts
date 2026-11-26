import { z } from 'zod'

/**
 * #2193.51 (épopée #2953) — LES DOCUMENTS D'UNE MISSION : contrat signé,
 * avenant, NDA, autre pièce suivie au niveau de la mission elle-même.
 * Aucun système de documents générique n'existait dans ce dépôt avant ce
 * lot ; le plus proche est `project-document.ts` (#2171.24, épopée #2951,
 * documents d'une OPPORTUNITÉ) — même forme (kind/name/status, sans fichier
 * joint), rattachée ici à la MISSION plutôt qu'à l'opportunité.
 *
 * ⚠️ PAS de fichier joint dans cette tranche, même raison que
 * `project-document.ts` : le suivi (kind/name/status) est la plus petite
 * tranche prouvable, l'intégration au stockage (octets, quota, URL signée)
 * reste HORS de ce lot.
 */

/** Liste FERMÉE — un statut texte libre ne s'agrège jamais. `contract` et
 *  `amendment` sont propres à la mission (contrairement à `project-document.ts`) :
 *  une mission porte un contrat signé et des avenants, une opportunité non. */
export const MISSION_DOCUMENT_KINDS = ['contract', 'amendment', 'nda', 'other'] as const
export const missionDocumentKindSchema = z.enum(MISSION_DOCUMENT_KINDS)
export type MissionDocumentKind = (typeof MISSION_DOCUMENT_KINDS)[number]

/** Même cycle que `project-document.ts` / `need-document.ts` — un vocabulaire
 *  déjà validé deux fois, pas une troisième variante. */
export const MISSION_DOCUMENT_STATUSES = ['draft', 'sent', 'pending', 'signed', 'refused'] as const
export const missionDocumentStatusSchema = z.enum(MISSION_DOCUMENT_STATUSES)
export type MissionDocumentStatus = (typeof MISSION_DOCUMENT_STATUSES)[number]

export const missionDocumentSchema = z.object({
  id: z.string().guid(),
  missionId: z.string().guid(),
  kind: missionDocumentKindSchema,
  name: z.string(),
  status: missionDocumentStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type MissionDocument = z.infer<typeof missionDocumentSchema>

export const missionDocumentsResponseSchema = z.object({ items: z.array(missionDocumentSchema) })
export type MissionDocumentsResponse = z.infer<typeof missionDocumentsResponseSchema>

/** Sans fichier à défaut, le nom est OBLIGATOIRE — même règle que
 *  `createProjectDocumentSchema`. */
export const createMissionDocumentSchema = z
  .object({
    kind: missionDocumentKindSchema,
    name: z.string().trim().min(1).max(255),
  })
  .strict()
export type CreateMissionDocumentInput = z.infer<typeof createMissionDocumentSchema>

export const updateMissionDocumentStatusSchema = z.object({ status: missionDocumentStatusSchema }).strict()
export type UpdateMissionDocumentStatusInput = z.infer<typeof updateMissionDocumentStatusSchema>
