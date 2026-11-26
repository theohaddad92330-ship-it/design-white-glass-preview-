import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Point 45 (briefs comptes, 01/10/2026) — le rattrapage ciblé du brief commercial.
// `workspaceId` est OBLIGATOIRE : jamais tout le parc. `accountIds` est un
// sous-ensemble de CET espace. `limit` borne le nombre d'appels modèle payants
// (le service re-plafonne). `force` remplace un brief existant : geste explicite.
export const adminCommercialBriefBackfillSchema = z.object({
  workspaceId: z.string().guid(),
  accountIds: z.array(z.string().guid()).min(1).max(200).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  force: z.boolean().optional(),
  afterId: z.string().guid().optional(),
})
export class AdminCommercialBriefBackfillDto extends createZodDto(adminCommercialBriefBackfillSchema) {}
