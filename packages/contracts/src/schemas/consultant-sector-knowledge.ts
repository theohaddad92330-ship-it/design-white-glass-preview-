import { z } from 'zod'

/**
 * #5017.2 — « les consultants qui connaissent ce secteur », sur la fiche compte.
 *
 * Une ligne = un consultant de l'ESPACE dont un secteur SOURCÉ (cité par son CV,
 * jamais déduit — #5017.1) recoupe le secteur du compte. Un consultant sans
 * secteur sourcé ne fait aucune ligne : « on n'affiche pas ce qu'on n'a pas ».
 */
export const consultantSectorKnowledgeSchema = z.object({
  id: z.string(),
  full_name: z.string().nullable(),
  /** Les secteurs de LA FICHE qui recoupent celui du compte — la preuve affichée. */
  matched_sectors: z.array(z.string()).min(1),
})
export type ConsultantSectorKnowledge = z.infer<typeof consultantSectorKnowledgeSchema>

export const consultantSectorKnowledgeListSchema = z.object({
  sector: z.string(),
  consultants: z.array(consultantSectorKnowledgeSchema),
})
export type ConsultantSectorKnowledgeList = z.infer<typeof consultantSectorKnowledgeListSchema>
