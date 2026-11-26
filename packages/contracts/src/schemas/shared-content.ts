import { z } from 'zod'

/**
 * #4158.30 — CONTENU PARTAGÉ AVEC L'ÉQUIPE / PERSONNEL.
 *
 * Un modèle de message, une séquence ou un exemple de la bibliothèque a un auteur. Deux états, et
 * seulement deux :
 *
 *  - `team` — partagé avec l'équipe : visible de tout l'espace (c'est le comportement d'AVANT, donc la
 *    valeur par défaut : aucune ligne existante ne change de visibilité) ;
 *  - `personal` — personnel : visible de son SEUL auteur, y compris pour un manager. Un manager qui veut
 *    qu'un modèle serve à l'équipe le demande à son auteur, il ne le lit pas par-dessus son épaule.
 *
 * Ajout seulement : la colonne est `NOT NULL DEFAULT 'team'`, contrainte CHECK posée avec elle.
 */
export const CONTENT_VISIBILITIES = ['team', 'personal'] as const
export const contentVisibilitySchema = z.enum(CONTENT_VISIBILITIES)
export type ContentVisibility = z.infer<typeof contentVisibilitySchema>

/** Corps de `PATCH …/:id/visibility` — l'auteur partage avec l'équipe, ou reprend en personnel. */
export const setContentVisibilitySchema = z.object({ visibility: contentVisibilitySchema })
export type SetContentVisibility = z.infer<typeof setContentVisibilitySchema>

/**
 * Qui lit ce contenu ? Le partagé : tout l'espace. Le personnel : son auteur, et personne d'autre.
 * Un contenu personnel SANS auteur connu n'est lisible de personne — on n'invente pas un propriétaire.
 */
export function isContentVisibleTo(
  content: { visibility: ContentVisibility; created_by: string | null },
  userId: string,
): boolean {
  return content.visibility === 'team' || content.created_by === userId
}
