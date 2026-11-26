import { z } from 'zod'

/**
 * Le pool de réactivation (PDF 3 §11).
 *
 * « Les profils que tu as déjà rencontrés. Voici ceux qu'il faut réveiller. »
 *
 * Sept segments, chacun répondant à une question qu'un recruteur se pose et à
 * laquelle rien ne répondait. Ils sont EN CODE, comme les vues du vivier :
 * l'intérêt d'un segment est qu'il veuille dire la même chose pour tout le
 * monde — « dormant » doit se discuter d'une ESN à l'autre.
 *
 * La règle qui les traverse tous : un segment ne remonte que ce qu'on peut
 * PROUVER. « Aucun contact depuis six mois » se lit sur une date ; « n'est plus
 * intéressé » ne se lit nulle part, et n'a donc pas de segment.
 */
export const TALENT_POOL_SEGMENTS = [
  'soon_available', //     fin d'affectation sous 45 jours
  'dormant', //            aucun contact depuis six mois
  'to_revalidate', //      disponibilité déclarée sans affectation qui la confirme
  'never_submitted', //    jamais positionné
  'recoverable_rejects', // refusés pour un motif non bloquant
  'rare_profiles', //      compétence présente chez moins de trois talents
  'archived', //           sortis du vivier actif, qu'un besoin peut rappeler
] as const
export const talentPoolSegmentSchema = z.enum(TALENT_POOL_SEGMENTS)
export type TalentPoolSegment = (typeof TALENT_POOL_SEGMENTS)[number]

/** Le seuil de chaque segment, en un seul endroit — pour qu'ils se discutent. */
export const POOL_THRESHOLDS = {
  /** « Bientôt disponibles » : assez tôt pour préparer, assez tard pour être vrai. */
  soonAvailableDays: 45,
  /** « Dormants » : six mois sans contact, la valeur du §11. */
  dormantMonths: 6,
  /** « Profils rares » : moins de trois talents portent la compétence. */
  rareSkillHolders: 3,
} as const

/**
 * Ce qu'un segment PROPOSE de faire, et rien de plus.
 *
 * L'action est une PROPOSITION affichée, jamais un envoi : le §11 liste des
 * gestes (« préparer le repositionnement », « message de reprise ») que c'est
 * au commercial de déclencher. Les automatiser transformerait un pool en
 * campagne, ce que le produit s'interdit.
 */
export const SEGMENT_ACTION: Record<TalentPoolSegment, string> = {
  soon_available: 'prepare_repositioning',
  dormant: 'draft_reconnect',
  to_revalidate: 'ask_availability',
  never_submitted: 'match_open_needs',
  recoverable_rejects: 'propose_elsewhere',
  rare_profiles: 'protect',
  archived: 'reactivate',
}

export const poolSegmentCountSchema = z.object({
  segment: talentPoolSegmentSchema,
  count: z.number().int().nonnegative(),
})
export type PoolSegmentCount = z.infer<typeof poolSegmentCountSchema>
