import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/** L'appel de la porte AVANT une action coûteuse : qui la déclenche, laquelle,
 *  et son coût ESTIMÉ — jamais le coût réel, qui n'est connu qu'après (D53). */
export const workspaceBudgetCheckSchema = z.object({
  actorUserId: z.string().min(1),
  actionKey: z.string().min(1),
  estimatedCostUsd: z.number().nonnegative(),
})
export class WorkspaceBudgetCheckDto extends createZodDto(workspaceBudgetCheckSchema) {}
