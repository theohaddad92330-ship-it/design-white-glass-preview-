import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// #4521.1 — le geste d'opérateur du rattrapage des contacts d'étapes de plan : UN espace, jamais le parc.
// Simulation PAR DÉFAUT : seul un `dry_run: false` explicite écrit.
const planItemContactBackfillSchema = z.object({
  workspace_id: z.string().guid(),
  dry_run: z.boolean().default(true),
})
export class PlanItemContactBackfillDto extends createZodDto(planItemContactBackfillSchema) {}
