import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { actionPlanOutcomeSchema, startAnalysisSchema } from '@bellum/contracts'

// MCP tool DTOs. None of them carry a user/workspace id — the controller
// derives the principal from the validated MCP access token, never the body.

/**
 * `start_analysis` with the credit handshake: without `confirm: true` the
 * controller answers a quote (cost, balance, duration, requires_confirmation)
 * WITHOUT launching anything. Same body as the browser start otherwise.
 */
export const mcpStartAnalysisSchema = startAnalysisSchema.extend({
  confirm: z.boolean().optional(),
})
export class McpStartAnalysisDto extends createZodDto(mcpStartAnalysisSchema) {}

/** `ask_bellum` — one free-text question about one account dossier. */
export const mcpAskSchema = z.object({
  question: z.string().min(1).max(4000),
})
export class McpAskDto extends createZodDto(mcpAskSchema) {}

/** `create_action` — a manual action added to the account's plan checklist. */
export const mcpCreateActionSchema = z.object({
  title: z.string().min(1).max(500),
  contact_id: z.string().guid().optional(),
  // Calendar date, no timezone — matches the `due_date` DATE column.
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date au format YYYY-MM-DD')
    .optional(),
})
export class McpCreateActionDto extends createZodDto(mcpCreateActionSchema) {}

/** `enrich_contact` — paying action, same confirm handshake as start_analysis. */
export const mcpEnrichContactSchema = z.object({
  confirm: z.boolean().optional(),
})
export class McpEnrichContactDto extends createZodDto(mcpEnrichContactSchema) {}

/** `find_opportunities` — entreprises qui montrent des signaux d'achat (lecture). */
export const mcpSignalsQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  // Texte libre (« data, Python, Azure ») : découpé côté service, borné à 5.
  skills: z.string().trim().min(1).max(300).optional(),
  // Une query string arrive en texte : `z.coerce.boolean()` lirait « false » comme vrai.
  in_portfolio: z
    .enum(['true', 'false'])
    .transform(value => value === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})
export class McpSignalsQueryDto extends createZodDto(mcpSignalsQuerySchema) {}

/** `list_due_actions` — relances dues ou en retard. */
export const mcpDueActionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
})
export class McpDueActionsQueryDto extends createZodDto(mcpDueActionsQuerySchema) {}

/**
 * `update_plan_item` — fait / à faire et/ou échéance d'une étape. Passer à
 * « fait » exige l'issue choisie (même règle que l'écran, #2396.2) ; « fait »
 * reste un geste DÉCLARATIF, jamais une preuve d'envoi.
 */
export const mcpUpdatePlanItemSchema = z
  .object({
    done: z.boolean().optional(),
    due_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date au format YYYY-MM-DD')
      .nullable()
      .optional(),
    outcome: actionPlanOutcomeSchema.optional(),
  })
  .refine(value => value.done !== undefined || value.due_date !== undefined, {
    message: 'Indiquez done et/ou due_date.',
  })
  .refine(value => value.done !== true || value.outcome !== undefined, {
    message: 'Pour marquer une étape faite, indiquez son issue (outcome).',
    path: ['outcome'],
  })
export class McpUpdatePlanItemDto extends createZodDto(mcpUpdatePlanItemSchema) {}
