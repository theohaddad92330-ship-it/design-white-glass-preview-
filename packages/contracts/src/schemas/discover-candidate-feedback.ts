import { z } from 'zod'

/**
 * #3671.2bis — le geste « Mauvaise entreprise » sur une carte Découvrir : le
 * signal affiché n'appartient pas à ce SIREN. Une seule valeur aujourd'hui ;
 * la liste s'élargira (GA-11/12) le jour où une autre nature de retour
 * Découvrir apparaît — jamais avant que la contrainte SQL ne l'admette.
 */
export const discoverCandidateFeedbackVerdictSchema = z.literal('wrong_company')
export type DiscoverCandidateFeedbackVerdict = z.infer<typeof discoverCandidateFeedbackVerdictSchema>

export const createDiscoverCandidateFeedbackSchema = z
  .object({
    verdict: discoverCandidateFeedbackVerdictSchema,
  })
  .strict()
export type CreateDiscoverCandidateFeedbackInput = z.infer<typeof createDiscoverCandidateFeedbackSchema>

export const discoverCandidateFeedbackResponseSchema = z.object({
  siren: z.string(),
  verdict: discoverCandidateFeedbackVerdictSchema,
  recordedAt: z.string(),
})
export type DiscoverCandidateFeedbackResponse = z.infer<typeof discoverCandidateFeedbackResponseSchema>
