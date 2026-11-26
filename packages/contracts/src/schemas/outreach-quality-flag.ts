import { z } from 'zod'

/**
 * #2877 (#2385.4, lot P06 30/09) — les signaux QUALITÉ d'un message, DÉCLARÉS
 * par le commercial qui le relit. « Faux fait », « CTA incorrect », « persona
 * incorrect » : le relecteur le dit, le système ne le DEVINE pas — distinguer
 * un faux fait supposerait de lire le CORPS du message, que la doctrine
 * interdit d'exposer (même à une classification). La source est donc un geste
 * humain explicite, jamais une lecture du texte.
 *
 * Liste fermée : élargie par la contrainte SQL AVANT le code (GA-11/12).
 */
export const OUTREACH_QUALITY_FLAG_KINDS = ['wrong_fact', 'wrong_cta', 'wrong_persona'] as const
export type OutreachQualityFlagKind = (typeof OUTREACH_QUALITY_FLAG_KINDS)[number]

export const flagOutreachMessageQualityRequestSchema = z.object({ kind: z.enum(OUTREACH_QUALITY_FLAG_KINDS) }).strict()
export type FlagOutreachMessageQualityRequest = z.infer<typeof flagOutreachMessageQualityRequestSchema>
