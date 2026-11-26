import { z } from 'zod'

/**
 * #4267 (décisions Louis 18/10/2026) — LE SUIVI D'UN COMPTE EST UN GESTE EXPLICITE, PAR UTILISATEUR.
 *
 * Jusqu'au 18/10, « suivi » se DÉDUISAIT du statut commercial (`watching` / `opportunity` / `customer`) :
 * tout compte classé était relu chaque jour par la veille, à nos frais. Désormais :
 *  · 4267.1 — par défaut on ne suit AUCUN compte ; « Suivre » / « Ne plus suivre » est distinct du statut
 *    commercial, et la veille, le rafraîchissement et les digests ne lisent QUE les suivis explicites ;
 *  · 4267.3 — {@link ACCOUNT_FOLLOW_MAX_PER_USER} comptes suivis au plus, PAR UTILISATEUR (pas par espace) ;
 *  · 4267.4 — la reprise a gardé les 3 plus récents de chacun, le reste est ARCHIVÉ (`migration_cap`),
 *    jamais supprimé : la ligne se re-suit en un clic.
 */

/** 4267.3 — LE plafond, à UN seul endroit (GA-26) : l'API le tient (409), l'écran le dit avant. */
// #4267 — Louis 23/10 : 3 par utilisateur, la maquette a6 (5) n'est pas retenue
export const ACCOUNT_FOLLOW_MAX_PER_USER = 3

/**
 * Pourquoi un suivi n'est plus actif (contrainte CHECK `account_follows_archived_reason_check`, GA-12) :
 *  · `unfollowed` — « Ne plus suivre », le geste de l'utilisateur ;
 *  · `migration_cap` — la reprise du 18/10 (au-delà des 3 plus récents) : l'écran le dit UNE fois.
 */
export const ACCOUNT_FOLLOW_ARCHIVE_REASONS = ['unfollowed', 'migration_cap'] as const

/** Le code du refus du 4e suivi (409) — l'écran le reconnaît sans lire le message. */
export const ACCOUNT_FOLLOW_CAP_REACHED = 'account_follow_cap_reached'

const accountFollowItemSchema = z.object({
  account_id: z.string(),
  company_name: z.string(),
  sector: z.string().nullable(),
  followed_at: z.string(),
  archived_at: z.string().nullable(),
  archived_reason: z.enum(ACCOUNT_FOLLOW_ARCHIVE_REASONS).nullable(),
  /** #4283.8 — la dernière analyse terminée du compte ; absent/null = jamais analysé (jamais une date inventée). */
  last_analyzed_at: z.string().nullable().optional(),
  /** #4283.8 — le jour (AAAA-MM-JJ, Paris) de la prochaine ré-analyse automatique d'un suivi ACTIF ; absent/null = aucune annoncée. */
  next_reanalysis_at: z.string().nullable().optional(),
  /** #4283.8 — pourquoi un suivi actif n'a pas de date (veille suspendue, jamais analysé) ; null = date présente. */
  next_reanalysis_reason: z.enum(['suspended', 'never_analyzed', 'not_followed']).nullable().optional(),
})
export type AccountFollowItem = z.infer<typeof accountFollowItemSchema>

/** 4267.2 — le compte analysé le plus récent de l'utilisateur, proposé quand il ne suit rien. */
const accountFollowSuggestionSchema = z.object({
  account_id: z.string(),
  company_name: z.string(),
  sector: z.string().nullable(),
  analyzed_at: z.string(),
})

/** `GET /account-follows` — ce que l'utilisateur suit, ce qu'il a suivi, et la proposition s'il ne suit rien. */
export const accountFollowsResponseSchema = z.object({
  max: z.number().int().positive(),
  followed: z.array(accountFollowItemSchema),
  archived: z.array(accountFollowItemSchema),
  /** Présente SEULEMENT si `followed` est vide ; `null` si l'utilisateur n'a aucun compte analysé. */
  suggestion: accountFollowSuggestionSchema.nullable(),
  /** 4267.4 — la reprise a archivé des suivis de cet utilisateur et il ne l'a pas encore lu. */
  migration_notice: z.boolean(),
})
export type AccountFollowsResponse = z.infer<typeof accountFollowsResponseSchema>

/** `POST|DELETE /accounts/:id/follow` — l'état après le geste. */
export const accountFollowStateSchema = z.object({
  account_id: z.string(),
  followed: z.boolean(),
  followed_count: z.number().int().nonnegative(),
})
