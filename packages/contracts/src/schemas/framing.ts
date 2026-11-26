import { z } from 'zod'

/**
 * Théo O onboarding-relecture.N1/N2 — « Je retiens cette stratégie · À travailler
 * plus tard · Ne pas retenir », enregistré PAR orientation, et la validation
 * explicite du cadrage (horodatée, avec l'empreinte des réponses relues).
 *
 * Les trois orientations sont des règles locales (`framing-readout.ts` côté
 * web) : un identifiant de plus se déclare ICI, avec la contrainte SQL de
 * `framing_decisions`, avant le code qui l'écrit (GA-11 / GA-12).
 */
export const FRAMING_ORIENTATION_IDS = ['proof', 'offer_split', 'decision_review'] as const
export const framingOrientationIdSchema = z.enum(FRAMING_ORIENTATION_IDS)

export const FRAMING_DECISIONS = ['retain', 'later', 'dismiss'] as const
export const framingDecisionSchema = z.enum(FRAMING_DECISIONS)

export const saveFramingDecisionSchema = z.object({ decision: framingDecisionSchema })

/** L'empreinte (hex) des réponses relues : valider un cadrage qui a bougé depuis n'est pas valider celui-ci. */
export const validateFramingSchema = z.object({ digest: z.string().min(8).max(128) })

export const framingStateResponseSchema = z.object({
  decisions: z.partialRecord(framingOrientationIdSchema, framingDecisionSchema),
  validated_at: z.string().nullable(),
  validated_digest: z.string().nullable(),
})

export type FramingOrientationId = z.infer<typeof framingOrientationIdSchema>
export type FramingDecision = z.infer<typeof framingDecisionSchema>
export type FramingStateResponse = z.infer<typeof framingStateResponseSchema>
