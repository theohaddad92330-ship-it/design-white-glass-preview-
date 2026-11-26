import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// #2231 — `confirmCount` OBLIGATOIRE : la route refuse d'écrire sans le
// compte que l'appelant a lu à l'audit (« le compte s'affiche avant
// d'écrire »). Un entier négatif ou absent est refusé par la validation
// AVANT même d'atteindre le service — pas seulement par la comparaison au
// compte courant.
export const regenerateProfileContextsSchema = z.object({
  confirmCount: z.number().int().nonnegative(),
})
export class RegenerateProfileContextsDto extends createZodDto(regenerateProfileContextsSchema) {}
