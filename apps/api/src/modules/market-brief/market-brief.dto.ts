import { z } from 'zod'
import { MARKET_SCOPES, marketZoneSchema } from '@bellum/contracts'

/** Plafonds par espace (décision du plan « Marchés locaux », L1). */
export const MAX_ZONES_PER_WORKSPACE = 10
export const MAX_DEPARTMENTS_PER_ZONE = 6

const code = z.string().trim().toUpperCase().min(1)

/**
 * Création d'une zone. La FORME et la cohérence france/suisse sont celles du contrat
 * (`marketZoneSchema`), rejouées ici telles quelles : un seul endroit dit ce qu'est une zone (GA-26).
 */
export const createMarketZoneSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    scope: z.enum(MARKET_SCOPES),
    departments: z.array(code).max(MAX_DEPARTMENTS_PER_ZONE).default([]),
    cantons: z.array(code).max(MAX_DEPARTMENTS_PER_ZONE).default([]),
    cities: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  })
  .strict()
  .superRefine((zone, ctx) => {
    const parsed = marketZoneSchema.safeParse(zone)
    if (parsed.success) return
    for (const issue of parsed.error.issues) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
  })

export type CreateMarketZone = z.infer<typeof createMarketZoneSchema>
