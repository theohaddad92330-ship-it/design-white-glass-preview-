import { z } from 'zod'
import { NOTE_MAX_LENGTH } from './note.js'

/**
 * #2151.59 (18/09/2026) — une note de terrain LIBRE, datée et signée,
 * attachée au CANDIDAT de Découvrir (identifié par son SIREN — il n'a pas de
 * ligne en base tant qu'il n'est pas devenu un compte).
 *
 * Le mécanisme des « questions d'accès » d'un dossier est un choix FERMÉ et
 * ne se généralise pas à du texte libre ; c'est une capacité neuve, minuscule
 * à dessein : un champ, un geste de saisie, une reprise à la conversion
 * (`AccountsService.create` re-tague les notes déjà écrites sur ce SIREN).
 *
 * Même plafond que le contrat générique des notes (`NOTE_MAX_LENGTH`) : une
 * note reste une note, pas un compte rendu.
 */
export const discoverCandidateNoteSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.string(),
  authorId: z.string().nullable(),
  /** Nom affichable de l'auteur, résolu côté serveur. `null` = membre parti —
   *  jamais un id brut à l'écran. */
  authorName: z.string().nullable(),
})
export type DiscoverCandidateNote = z.infer<typeof discoverCandidateNoteSchema>

export const createDiscoverCandidateNoteSchema = z
  .object({
    body: z.string().trim().min(1).max(NOTE_MAX_LENGTH),
  })
  .strict()
export type CreateDiscoverCandidateNoteInput = z.infer<typeof createDiscoverCandidateNoteSchema>

export const discoverCandidateNotesResponseSchema = z.object({
  notes: z.array(discoverCandidateNoteSchema),
})
export type DiscoverCandidateNotesResponse = z.infer<typeof discoverCandidateNotesResponseSchema>
