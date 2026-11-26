import { z } from 'zod'

export const actionPlanSchema = z.object({
  id: z.string().guid(),
  account_id: z.string().guid(),
  user_id: z.string().guid(),
  strategy_type: z.string().nullable(),
  strategy_justification: z.string().nullable(),
  weeks: z.array(z.unknown()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
})

export type ActionPlan = z.infer<typeof actionPlanSchema>
