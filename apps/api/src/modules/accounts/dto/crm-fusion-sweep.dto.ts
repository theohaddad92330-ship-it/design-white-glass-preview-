import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * #4603 — un passage du rattrapage des paires compte-CRM ↔ compte-analyse. La SIMULATION est le défaut
 * (comptée, rien d'écrit) ; la borne d'un passage est plafonnée : jamais tout le parc d'un coup.
 */
export class CrmFusionSweepDto extends createZodDto(
  z.object({
    dryRun: z.boolean().default(true),
    limit: z.number().int().min(1).max(100).default(25),
  }),
) {}
