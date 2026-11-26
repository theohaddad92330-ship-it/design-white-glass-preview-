import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { planFeatureKeySchema } from '@bellum/contracts'

const nonNegativeInt = z.number().int().min(0)

/**
 * Operator edit of an EXISTING plan's template (name / price / caps / seats).
 * All fields optional (partial update); at least one must be present. Numeric
 * fields are non-negative integers (`price` is in cents). Creating/deleting a
 * plan is out of scope for v1 — the key comes from the URL and must already exist.
 */
export const updatePlanSchema = z
  .object({
    label: z.string().trim().min(1).max(60).optional(),
    price: nonNegativeInt.optional(),
    accounts_limit: nonNegativeInt.optional(),
    enrichment_credits: nonNegativeInt.optional(),
    seats: nonNegativeInt.optional(),
    extra_seat_price: nonNegativeInt.optional(),
    /** La grille de gating : les features ouvertes par le palier. Liste
     *  COMPLÈTE — une liste vide ferme tout, et c'est une valeur légitime. */
    features: z.array(planFeatureKeySchema).optional(),
  })
  .refine(value => Object.keys(value).length > 0, { message: 'Indiquer au moins un champ à modifier.' })

export class UpdatePlanDto extends createZodDto(updatePlanSchema) {}
