import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// #balayage-weekly-digest — `confirmCount` OBLIGATOIRE : la route refuse
// d'écrire sans le compte que l'appelant a lu à l'audit (« le compte
// s'affiche avant d'écrire »). Un entier négatif ou absent est refusé par la
// validation AVANT même d'atteindre le service.
export const sweepWeeklyDigestSchema = z.object({
  confirmCount: z.number().int().nonnegative(),
})
export class SweepWeeklyDigestDto extends createZodDto(sweepWeeklyDigestSchema) {}
