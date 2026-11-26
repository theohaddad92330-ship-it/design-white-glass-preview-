import { z } from 'zod'

/**
 * #4419 — `query.funnel` : le REJET d'une recherche Découvrir, entrés / retenus / écartés PAR CRITÈRE
 * (posé par `apps/ia/app/services/discover_funnel.py`, l'unique endroit qui le fabrique — GA-26).
 *
 * « Le filtre ne tourne pas » et « le filtre tourne et rejette presque tout » donnaient le même écran.
 * Un critère qui n'a rien écarté est ABSENT (jamais « 0 écarté » — GA-18/19), un amont muet sur ce qu'il a vu ne
 * fait pas inventer « entrés ». Ce compteur dit ce que NOUS avons écarté, jamais ce que le marché fait (GA-259).
 */
const count = z.number().int().nonnegative()

export const DISCOVER_FUNNEL_CRITERIA = [
  'city',
  'zone',
  'trade',
  'headcount',
  'sector',
  'individual',
  'ceased',
  'duplicate',
  'portfolio',
] as const
export type DiscoverFunnelCriterion = (typeof DISCOVER_FUNNEL_CRITERIA)[number]

const discoverFunnelSchema = z.object({
  entered: count.optional(),
  kept: count,
  rejected: z.record(z.string(), z.unknown()).optional(),
})

export interface DiscoverFunnel {
  entered?: number
  kept: number
  rejected: { criterion: DiscoverFunnelCriterion; count: number }[]
}

/** `query.funnel` d'une réponse `/discover`, ou `null` (absent, illisible). Seuls les critères > 0 sortent. */
export function readDiscoverFunnel(query: Readonly<Record<string, unknown>> | undefined): DiscoverFunnel | null {
  const parsed = discoverFunnelSchema.safeParse(query?.funnel)
  if (!parsed.success) return null
  const rejected = DISCOVER_FUNNEL_CRITERIA.flatMap(criterion => {
    const n = parsed.data.rejected?.[criterion]
    return typeof n === 'number' && Number.isInteger(n) && n > 0 ? [{ criterion, count: n }] : []
  })
  return {
    ...(parsed.data.entered === undefined ? {} : { entered: parsed.data.entered }),
    kept: parsed.data.kept,
    rejected,
  }
}
