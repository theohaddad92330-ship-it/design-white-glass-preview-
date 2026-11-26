import { z } from 'zod'

/**
 * Théo D team-review — « Le point d'équipe » : un court parcours en trois
 * écrans (les sujets → les décisions → la relecture) qui transforme des constats
 * en actions du plan.
 *
 * Les décisions ÉCRIVENT dans le plan d'action du compte (jamais d'e-mail,
 * jamais de changement d'étape d'une affaire) : « Les actions existantes sont
 * mises à jour, jamais dupliquées » — l'identité d'une action est celle que le
 * plan connaît déjà (compte + libellé + objet), pas une seconde clé.
 *
 * « Point sans nouvelle action » (`no_new_action`) enregistre le point et sa
 * note sans fabriquer de tâche : un fait n'est pas une action.
 */
const dayRegex = /^\d{4}-\d{2}-\d{2}$/

/** Au-delà, le point n'est plus un point : il se découpe. */
const TEAM_REVIEW_MAX_DECISIONS = 20

export const teamReviewDecisionSchema = z.object({
  /** Le sujet du point d'où la décision vient (clé stable, jamais affichée). */
  topic_id: z.string().trim().min(1).max(200),
  account_id: z.string().guid(),
  /** « Prochaine action » — le geste écrit. */
  label: z.string().trim().min(1).max(300),
  /** Quand le sujet est une action du plan DÉJÀ ouverte : elle est mise à jour. */
  existing_item_id: z.string().guid().optional(),
  /** Le responsable : un membre de l'espace (vérifié côté serveur). */
  owner_id: z.string().guid(),
  due_date: z.string().regex(dayRegex, 'due_date must be an ISO calendar date (YYYY-MM-DD)'),
  /** Pourquoi — la raison du sujet, obligatoire comme pour toute action du plan. */
  reason: z.string().trim().min(1).max(1000),
})
export type TeamReviewDecision = z.infer<typeof teamReviewDecisionSchema>

export const saveTeamReviewSchema = z
  .object({
    decisions: z.array(teamReviewDecisionSchema).max(TEAM_REVIEW_MAX_DECISIONS),
    /** « Un autre point à partager » — du texte libre, jamais un e-mail. */
    note: z.string().trim().max(2000).optional(),
    no_new_action: z.boolean().default(false),
  })
  .strict()
  .refine(review => review.no_new_action || review.decisions.length > 0, {
    message: 'a team review needs at least one decision, or no_new_action',
    path: ['decisions'],
  })
  .refine(review => !review.no_new_action || review.decisions.length === 0, {
    message: 'no_new_action cannot carry decisions',
    path: ['no_new_action'],
  })
export type SaveTeamReview = z.infer<typeof saveTeamReviewSchema>

/** Ce qui est arrivé à UNE décision : créée, mise à jour (déjà au plan), jamais dupliquée. */
const TEAM_REVIEW_OUTCOMES = ['created', 'updated'] as const
const teamReviewOutcomeSchema = z.enum(TEAM_REVIEW_OUTCOMES)

export const savedTeamReviewSchema = z.object({
  review_id: z.string().guid(),
  results: z.array(
    z.object({
      topic_id: z.string(),
      item_id: z.string().guid(),
      outcome: teamReviewOutcomeSchema,
    }),
  ),
})
export type SavedTeamReview = z.infer<typeof savedTeamReviewSchema>
