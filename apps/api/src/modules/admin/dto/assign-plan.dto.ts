import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Operator assigns a billing plan to a user. Only the catalog keys are accepted;
// the service derives accounts_limit + enrichment_credits from PLAN_CONFIG so the
// two never drift. `beta` is here (not in the public checkout): the reserved beta
// plan is onboarded by an operator from the backoffice, never self-served.
export const assignPlanSchema = z.object({
  plan: z.enum(['trial', 'starter', 'team', 'growth', 'beta']),
})
export class AssignPlanDto extends createZodDto(assignPlanSchema) {}
