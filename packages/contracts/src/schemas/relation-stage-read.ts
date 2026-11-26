import { z } from 'zod'

import { relationshipStateSchema } from './sales-context.js'

/**
 * #4289.12 (chantier #4289, arbitrage du 26/10/2026) — UN moteur du « stade de relation », deux lecteurs.
 *
 * Avant ce contrat, « même stade de relation » avait DEUX définitions : les cas similaires (apps/api,
 * `relationStageOf`) comparaient un stade de la liste FERMÉE (`relationshipStateSchema`) ; le générateur
 * d'alternatives (apps/ia) le déclarait dès que le compte visé ET le candidat étaient « vus dans le CRM » — un
 * prospect et un client actif sortaient « au même stade ». Arbitrage : le moteur est celui de l'API (stade saisi,
 * à défaut missions signées), l'IA le LIT par SIREN par ce contrat et ne compare que deux stades connus.
 *
 * Un SIREN sans compte de l'espace, ou dont le stade n'est pas établi, est ABSENT de `bySiren` : « on ne sait
 * pas » n'est pas un stade (GA-18/GA-19). Jamais une donnée d'un autre espace (`workspace_id`).
 */
export const relationStagesBySirenRequestSchema = z
  .object({
    userId: z.string().guid(),
    sirens: z
      .array(
        z
          .string()
          .trim()
          .regex(/^\d{9}$/),
      )
      .min(1)
      .max(20),
  })
  .strict()

/** D'où vient le stade : SAISI par le commercial (gagne toujours) ou déduit des missions SIGNÉES de l'espace. */
const relationStageSourceSchema = z.enum(['saisi', 'missions'])

export const relationStagesBySirenResponseSchema = z
  .object({
    bySiren: z.record(
      z.string().regex(/^\d{9}$/),
      z.object({ relationStage: relationshipStateSchema, source: relationStageSourceSchema }).strict(),
    ),
  })
  .strict()

export type RelationStagesBySirenResponse = z.infer<typeof relationStagesBySirenResponseSchema>
