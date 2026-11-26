import { z } from 'zod'
import { scoreFactorSchema } from './analysis/plan.js'

/**
 * Typed payload of the Strategist agent (Phase 4) — TypeScript mirror of
 * `apps/ia/app/models/strategy_data.py` (which extends `ActionPlanOutput`).
 *
 * Convention: camelCase + English. Permissive via `.passthrough()` so prompt
 * iterations don't break TS consumers — strict shape per nested block is a
 * later ticket once consumers agree on the surface they actually read.
 *
 * ⚠️ Wire-format drift: the Python prompt + Pydantic still emit
 * `if_no_response` (snake_case). The `.passthrough()` lets the payload
 * parse but TS consumers must read it via the legacy key until the prompt
 * + alias are renamed in a follow-up ticket.
 */

const _passThroughObject = z.object({}).passthrough()
const _passThroughArrayOfObjects = z.array(_passThroughObject).optional()

export const actionPlanSectionSchema = z
  .object({
    strategy: z.string().optional(),
    justification: z.string().optional(),
    phases: _passThroughArrayOfObjects,
  })
  .passthrough()
export type ActionPlanSection = z.infer<typeof actionPlanSectionSchema>

export const offerToProposeSchema = z
  .object({
    title: z.string().optional(),
    pitch: z.string().optional(),
    targetContact: z.string().optional(),
    painAddressed: z.string().optional(),
    estimatedTJM: z.string().optional(),
    estimatedTeamSize: z.string().optional(),
    estimatedDuration: z.string().optional(),
    differentiator: z.string().optional(),
  })
  .passthrough()
export type OfferToPropose = z.infer<typeof offerToProposeSchema>

export const evaluationSchema = z
  .object({
    goNoGo: z.string().optional(),
    globalScore: z.number().int().min(0).max(10).optional(),
    justification: z.string().optional(),
    risks: _passThroughArrayOfObjects,
  })
  .passthrough()
export type Evaluation = z.infer<typeof evaluationSchema>

export const prioritySubAccountSchema = z
  .object({
    name: z.string().optional(),
    why: z.string().optional(),
    entryContact: z.string().optional(),
    suggestedOffer: z.string().optional(),
  })
  .passthrough()
export type PrioritySubAccount = z.infer<typeof prioritySubAccountSchema>

export const strategyDataSchema = z
  .object({
    actionPlan: actionPlanSectionSchema.optional(),
    offersToPropose: z.array(offerToProposeSchema).optional(),
    quickWins: _passThroughArrayOfObjects,
    ifNoResponse: _passThroughObject.optional(),
    evaluation: evaluationSchema.optional(),
    prioritySubAccounts: z.array(prioritySubAccountSchema).optional(),
    competitiveStrategy: _passThroughObject.optional(),
    // Two explicit score axes + evidence (Théo P1). camelCase containers on the
    // phase-4 wire; both 0-100, optional / backward-compatible.
    commercialScore: z.number().optional(),
    dataConfidence: z.number().nullable().optional(),
    scoreFactors: z.array(scoreFactorSchema).optional(),
  })
  .passthrough()
export type StrategyData = z.infer<typeof strategyDataSchema>
