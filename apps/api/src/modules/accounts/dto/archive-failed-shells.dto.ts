import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * #4621.3 — un LOT DATÉ de coquilles d'échec : le jour de création (AAAA-MM-JJ), la taille attendue (199, 823…)
 * et un mode « à blanc » qui mesure sans écrire. Pas de champ « tout » : le parc entier ne se désigne pas.
 */
export class ArchiveFailedShellsDto extends createZodDto(
  z.object({
    createdOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    expected: z.number().int().min(0).optional(),
    dryRun: z.boolean().optional(),
  }),
) {}
