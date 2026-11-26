import { z } from 'zod'

/**
 * Commentaire d'équipe (cockpit manager §10, bloc « Capitalisation & collaboration »).
 *
 * Un fil de commentaires partagés à l'échelle du workspace : le manager et les
 * commerciaux capitalisent une idée, un retour terrain, un point de coordination.
 * Optionnellement rattaché à un compte (`account_id`). Rien d'inventé — que du
 * texte réellement écrit par un membre. Table : `team_comments` (RLS workspace).
 *
 * #1940.6 — le MÊME fil sert aussi un commentaire sur une conversation `/chat`
 * (`conversation_id`) ou une réponse précise de ce fil (`message_id`) — visible
 * des seuls membres autorisés à OUVRIR ce fil (réutilise #1955.12, D5).
 */

/** Un commentaire tel que renvoyé, identité et compte résolus côté serveur. */
export const teamCommentSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  author_user_id: z.string(),
  /** Nom de l'auteur résolu depuis `profiles` ; `null` si le profil n'est pas rempli. */
  author_name: z.string().nullable(),
  body: z.string(),
  /** Compte ciblé (facultatif) — `null` quand le commentaire est général à l'équipe. */
  account_id: z.string().nullable(),
  /** Nom du compte ciblé, résolu côté serveur quand `account_id` est renseigné. */
  company_name: z.string().nullable(),
  /** #1940.6 — le fil ciblé (facultatif) — `null` = commentaire général. */
  conversation_id: z.string().nullable(),
  /** #1940.6 — la réponse précise ciblée (facultatif) — `null` = commentaire de fil. */
  message_id: z.string().nullable(),
  /** #2914 (#2128.9) — les collègues mentionnés, jamais `null` (tableau vide = aucun). */
  mentioned_user_ids: z.array(z.string()),
  /** #4158.31 — `null` = racine d'un fil ; sinon la racine à laquelle cette réponse se rattache. */
  parent_comment_id: z.string().nullable().default(null),
  /** #4158.31 — fil résolu (porté par la racine) : quand et par qui. `null` = ouvert. */
  resolved_at: z.string().nullable().default(null),
  resolved_by: z.string().nullable().default(null),
  created_at: z.string(),
})
export type TeamComment = z.infer<typeof teamCommentSchema>

/**
 * Corps de `POST /team-comments` — partager une idée / un commentaire. `body` est
 * borné (jamais vide, jamais un pavé) ; `account_id` est optionnel (commentaire
 * général) et re-vérifié côté serveur comme appartenant au workspace.
 *
 * #1940.6 — `conversation_id` cible un fil `/chat` ; `message_id`, quand
 * renseigné, cible UNE réponse de ce fil (sinon le commentaire porte sur le
 * fil entier). Les deux sont re-vérifiés côté serveur (accès #1955.12,
 * appartenance au workspace).
 */
export const createTeamCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  account_id: z.string().guid().nullable().optional(),
  conversation_id: z.string().trim().min(1).nullable().optional(),
  message_id: z.string().guid().nullable().optional(),
  /**
   * #2914 (#2128.9) — les collègues à mentionner, re-vérifiés côté serveur
   * comme membres de l'espace (`WorkspaceContextService.listMembers`) : un id
   * qui n'en est pas un est refusé, jamais retenu en silence.
   */
  mentioned_user_ids: z.array(z.string().guid()).max(20).optional(),
  /** #4158.31 — répondre dans un fil : l'identifiant d'un commentaire du fil (racine ou réponse). */
  parent_comment_id: z.string().guid().nullable().optional(),
})
export type CreateTeamComment = z.infer<typeof createTeamCommentSchema>

/** Réponse de `GET /team-comments` — la tête de fil, plus récente d'abord. */
/** #4158.31 — corps de `PATCH /team-comments/:id/resolution` : marquer le fil résolu, ou le rouvrir. */
export const setTeamThreadResolutionSchema = z.object({ resolved: z.boolean() })
export type SetTeamThreadResolution = z.infer<typeof setTeamThreadResolutionSchema>

export const teamCommentsResponseSchema = z.object({
  items: z.array(teamCommentSchema),
})
export type TeamCommentsResponse = z.infer<typeof teamCommentsResponseSchema>
