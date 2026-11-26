import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// #3549 — le geste d'opérateur du rattrapage des coordonnées manquantes. `actor`
// trace QUI a déclenché le lot ; `limit` borne le nombre de contacts rejoués en
// un appel — jamais tout le parc.
export const adminContactReachabilityCatchupSchema = z.object({
  actor: z.string().max(200).optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
})
export class AdminContactReachabilityCatchupDto extends createZodDto(adminContactReachabilityCatchupSchema) {}

// E1 (#3698, décision Louis 07/10, point 6) — le rattrapage CIBLÉ : une liste
// d'ids (l'échantillon de 25), bornée à 50 — jamais le parc.
const adminContactReachabilityTargetedSchema = z.object({
  actor: z.string().max(200).optional(),
  contact_ids: z.array(z.string().guid()).min(1).max(50),
})
export class AdminContactReachabilityTargetedDto extends createZodDto(adminContactReachabilityTargetedSchema) {}
