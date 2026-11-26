import { z } from 'zod'

/**
 * Agent orchestration envelope — see `agent_docs/agent-contract.md`.
 *
 * Mirrored 1:1 by the Pydantic model in
 * `apps/ia/app/models/agent_envelope.py`. A parity fixture lives at
 * `agent_docs/agent-contract.fixtures.json` and is parsed by both sides in CI.
 */

export const agentStatusSchema = z.enum([
  'success',
  'partial_success',
  'recoverable_failure',
  'terminal_failure',
  'cancelled',
])
export type AgentStatus = z.infer<typeof agentStatusSchema>

export const errorServiceSchema = z.enum([
  'claude',
  'firecrawl',
  'brave',
  'apollo',
  'pappers',
  'supabase',
  'internal',
  'precondition',
])
export type ErrorService = z.infer<typeof errorServiceSchema>

export const errorSeveritySchema = z.enum(['recoverable', 'terminal'])
export type ErrorSeverity = z.infer<typeof errorSeveritySchema>

export const sourceHealthSchema = z.enum(['ok', 'degraded', 'down', 'skipped'])
export type SourceHealth = z.infer<typeof sourceHealthSchema>

export const tokenUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cost_usd: z.number().nonnegative(),
  // C3 prompt-cache (optional — absent on calls without cache_control).
  cache_read_input_tokens: z.number().int().nonnegative().optional(),
  cache_creation_input_tokens: z.number().int().nonnegative().optional(),
})
export type TokenUsage = z.infer<typeof tokenUsageSchema>

export const agentWarningSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  message: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
})
export type AgentWarning = z.infer<typeof agentWarningSchema>

export const agentMetaSchema = z.object({
  // Identification
  agent_name: z.string().regex(/^[a-z][a-z0-9_]+$/),
  agent_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  // Traceability
  correlation_id: z.string(),
  started_at: z.string().datetime({ offset: true }),
  finished_at: z.string().datetime({ offset: true }),
  duration_ms: z.number().int().nonnegative(),
  // LLM
  prompt_name: z.string().optional(),
  model: z.string().optional(),
  token_usage: tokenUsageSchema.optional(),
  // External sources
  source_health: z.record(z.string(), sourceHealthSchema).optional(),
  // Internal retry
  retry_count: z.number().int().nonnegative().optional(),
  // Warnings — required when status === 'partial_success'
  warnings: z.array(agentWarningSchema).optional(),
})
export type AgentMeta = z.infer<typeof agentMetaSchema>

export type AgentError = {
  code: string
  service: ErrorService
  severity: ErrorSeverity
  retryable: boolean
  user_message: string
  debug_message: string
  cause?: AgentError
  context?: Record<string, unknown>
}

export const agentErrorSchema: z.ZodType<AgentError> = z.lazy(() =>
  z
    .object({
      code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
      service: errorServiceSchema,
      severity: errorSeveritySchema,
      retryable: z.boolean(),
      user_message: z.string().min(1),
      debug_message: z.string().min(1),
      cause: agentErrorSchema.optional(),
      context: z.record(z.string(), z.unknown()).optional(),
    })
    .refine(err => err.retryable === (err.severity === 'recoverable'), {
      message: 'retryable MUST match severity (recoverable ↔ true, terminal ↔ false)',
    }),
)

/**
 * Generic envelope factory. Pass the schema describing the agent's `data`
 * payload; the returned schema enforces the status/data/error invariants
 * described in `agent_docs/agent-contract.md` §1.
 */
export const agentEnvelopeSchema = <T extends z.ZodType>(data: T) =>
  z
    .object({
      status: agentStatusSchema,
      data: data.nullable(),
      error: agentErrorSchema.nullable(),
      meta: agentMetaSchema,
    })
    // Typé à la main : `data` est générique, zod 4 n'en déduit plus la clé.
    .superRefine(
      (env: { status: z.infer<typeof agentStatusSchema>; data?: unknown; error?: unknown; meta: AgentMeta }, ctx) => {
        const hasData = env.data !== null && env.data !== undefined
        const hasError = env.error !== null && env.error !== undefined
        const s = env.status

        if (s === 'success' || s === 'partial_success') {
          if (!hasData || hasError) {
            ctx.addIssue({
              code: 'custom',
              message: `status=${s}: data MUST be set and error MUST be null`,
            })
          }
        } else if (s === 'recoverable_failure' || s === 'terminal_failure') {
          if (hasData || !hasError) {
            ctx.addIssue({
              code: 'custom',
              message: `status=${s}: data MUST be null and error MUST be set`,
            })
          }
        } else if (s === 'cancelled') {
          if (hasData || hasError) {
            ctx.addIssue({
              code: 'custom',
              message: 'status=cancelled: both data and error MUST be null',
            })
          }
        }

        if (s === 'partial_success') {
          const warnings = env.meta.warnings ?? []
          if (warnings.length === 0) {
            ctx.addIssue({
              code: 'custom',
              message: 'status=partial_success requires meta.warnings to be non-empty',
            })
          }
        }
      },
    )

/** Untyped envelope — useful at the API boundary where the payload is opaque. */
export const unknownAgentEnvelopeSchema = agentEnvelopeSchema(z.unknown())
export type UnknownAgentEnvelope = z.infer<typeof unknownAgentEnvelopeSchema>
