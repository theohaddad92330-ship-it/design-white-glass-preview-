import { z } from 'zod'

/**
 * Équipe › Recherches — les recherches CONSERVÉES de toute l'équipe (Théo D team-recherches).
 *
 * Deux natures, une seule liste :
 *  - `discover` : une recherche lancée dans Découvrir (périmètre + nombre de comptes du résultat) ;
 *  - `analysis` : une analyse de compte lancée (un compte analysé).
 *
 * Lecture ouverte à TOUT membre de l'espace (Louis 22/10, Q3) — le journal d'un collègue est un
 * fait métier, jamais « qui a consulté quel compte ». Aucun coût en chiffre (#4468).
 */
export const TEAM_RESEARCH_KINDS = ['discover', 'analysis'] as const
export const teamResearchKindSchema = z.enum(TEAM_RESEARCH_KINDS)
export type TeamResearchKind = z.infer<typeof teamResearchKindSchema>

export const teamResearchItemSchema = z.object({
  id: z.string(),
  kind: teamResearchKindSchema,
  occurred_at: z.string(),
  /** « Banque & assurance · Lyon » (Découvrir) ou le nom du compte (analyse). */
  title: z.string(),
  /** Le périmètre en une ligne ; `null` quand il n'a pas été dit (jamais inventé). */
  scope_label: z.string().nullable(),
  /** Comptes du résultat enregistré (Découvrir) ; `1` pour une analyse ; `null` = non mesuré. */
  account_count: z.number().int().nonnegative().nullable(),
  /** Actions ouvertes sur les comptes de la recherche (0 = aucune, un vrai zéro mesuré). */
  open_action_count: z.number().int().nonnegative(),
  /** Le titre de la plus proche action ouverte (analyse d'un compte) ; `null` quand aucune. */
  next_action: z.string().nullable(),
  author_user_id: z.string().nullable(),
  author_name: z.string().nullable(),
  /** Le compte analysé (`analysis`) — pour ouvrir son dossier ; `null` pour Découvrir. */
  account_id: z.string().nullable(),
  /** Les filtres à rejouer dans Découvrir (`discover`) ; `null` pour une analyse. */
  filters: z.record(z.string(), z.unknown()).nullable(),
})
export type TeamResearchItem = z.infer<typeof teamResearchItemSchema>

export const teamResearchResponseSchema = z.object({ items: z.array(teamResearchItemSchema) })
export type TeamResearchResponse = z.infer<typeof teamResearchResponseSchema>

/** Ce que Découvrir poste à chaque recherche lancée. */
export const recordTeamResearchSchema = z.object({
  title: z.string().trim().min(1).max(200),
  scope_label: z.string().trim().max(300).nullable().optional(),
  filters: z.record(z.string(), z.unknown()),
  result_count: z.number().int().nonnegative().nullable().optional(),
  account_ids: z.array(z.string().guid()).max(200).optional(),
})
export type RecordTeamResearch = z.infer<typeof recordTeamResearchSchema>
