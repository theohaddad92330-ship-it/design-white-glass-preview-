import { z } from 'zod'

/**
 * #4194 (épopée #4191, lot L3) — le panneau latéral UNIQUE : clic sur une carte
 * ou une ligne (opportunité, besoin, positionnement, mission, consultant) →
 * propriétés, historique, objets liés cliquables. `GET /record-links/:kind/:id`
 * rend les trois zones d'un coup ; lecture seule, scopé à l'espace.
 *
 * Le COMPTE n'est pas un type de panneau : il apparaît comme lien (`kind:
 * 'account'`) et s'ouvre par sa fiche, jamais dans le panneau.
 */
export const RECORD_PANEL_KINDS = ['opportunity', 'need', 'submission', 'mission', 'consultant'] as const
export const recordPanelKindSchema = z.enum(RECORD_PANEL_KINDS)
export type RecordPanelKind = z.infer<typeof recordPanelKindSchema>

export const recordLinkKindSchema = z.enum([...RECORD_PANEL_KINDS, 'account'])
export type RecordLinkKind = z.infer<typeof recordLinkKindSchema>

export const recordLinkSchema = z.object({
  kind: recordLinkKindSchema,
  id: z.string().guid(),
  label: z.string(),
  /** Statut brut du lien (étape, stade, statut) ; `null` = non renseigné. */
  status: z.string().nullable(),
})
export type RecordLink = z.infer<typeof recordLinkSchema>

export const recordLinkGroupSchema = z.object({
  kind: recordLinkKindSchema,
  items: z.array(recordLinkSchema),
})
export type RecordLinkGroup = z.infer<typeof recordLinkGroupSchema>

export const recordPropertySchema = z.object({
  key: z.string(),
  /** `null` = non renseigné : le panneau n'affiche PAS la ligne (jamais « 0 »). */
  value: z.string().nullable(),
})
export type RecordProperty = z.infer<typeof recordPropertySchema>

export const recordHistoryEntrySchema = z.object({
  id: z.string().guid(),
  fromState: z.string().nullable(),
  toState: z.string(),
  proof: z.string().nullable(),
  occurredAt: z.string(),
})
export type RecordHistoryEntry = z.infer<typeof recordHistoryEntrySchema>

export const recordLinksResponseSchema = z.object({
  kind: recordPanelKindSchema,
  id: z.string().guid(),
  label: z.string(),
  status: z.string().nullable(),
  properties: z.array(recordPropertySchema),
  history: z.array(recordHistoryEntrySchema),
  /** Groupes non vides uniquement : une absence ne fait aucune ligne. */
  links: z.array(recordLinkGroupSchema),
})
export type RecordLinksResponse = z.infer<typeof recordLinksResponseSchema>
