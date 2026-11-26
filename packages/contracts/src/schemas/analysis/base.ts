import { z } from 'zod'

/**
 * Shared Zod primitives for ``raw_analysis`` sub-schemas. Centralised so all
 * analysis sections use the same nullable-optional shape — easier to grep,
 * easier to evolve, and the inferred TypeScript types are consistent across
 * every section component that consumes them.
 */

export const nullableString = z.string().optional().nullable()
export const nullableNumber = z.number().optional().nullable()
export const nullableBoolean = z.boolean().optional().nullable()
export const nullableInt = z.number().int().optional().nullable()
