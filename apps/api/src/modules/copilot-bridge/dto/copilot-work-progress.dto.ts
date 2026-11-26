import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * #4611 — « où en est mon travail lancé ? ». `lotId` est facultatif : sans lui, les cinq familles ; avec lui,
 * UN lot d'analyses — que le service refuse (`lot_unknown`) s'il n'est pas dans le périmètre de l'appelant.
 */
export class CopilotWorkProgressDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      lotId: z.string().guid().optional(),
    })
    .strict(),
) {}
