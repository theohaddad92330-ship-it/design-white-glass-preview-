import type { AgentError } from './agent-envelope.js'

/**
 * Adapters from existing typed errors to {@link AgentError}.
 *
 * Mirrors the Python adapters in `apps/ia/app/models/agent_error_adapters.py`.
 * Tests in `agent-error-adapters.test.ts` cover every code listed in
 * `agent_docs/agent-contract.md` §5.
 *
 * `HttpErrorLike` is the structural shape of `@bellum/errors`'s `HttpError`. We
 * declare it locally instead of importing the class so the contracts package
 * stays a leaf with no workspace dependencies. Any object matching this shape
 * — including the concrete `HttpError` thrown by the IA client — works.
 */

export type HttpErrorLike = {
  status: number
  body: string
  retryable: boolean
  endpoint: string
  cause?: Error | unknown
}

type TypedDetail = {
  code?: string
  service?: AgentError['service']
  user_message?: string
}

/**
 * Best-effort extraction of a typed FastAPI detail block from an HttpError body.
 * The IA service wraps its typed exceptions in
 * `{ "detail": { "code": "...", "service": "...", "user_message": "..." } }`,
 * so when the upstream is reachable we can preserve the original code chain.
 */
function tryExtractTypedDetail(body: string): TypedDetail | null {
  if (!body) return null
  try {
    const parsed: unknown = JSON.parse(body)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'detail' in parsed &&
      typeof (parsed as { detail: unknown }).detail === 'object' &&
      (parsed as { detail: unknown }).detail !== null
    ) {
      const detail = (parsed as { detail: TypedDetail }).detail
      if (typeof detail.code === 'string' && typeof detail.user_message === 'string') {
        return detail
      }
    }
  } catch {
    // Body wasn't JSON — fall through to the generic mapping.
  }
  return null
}

const SERVICE_WHITELIST = new Set<AgentError['service']>([
  'claude',
  'firecrawl',
  'brave',
  'apollo',
  'pappers',
  'supabase',
  'internal',
  'precondition',
])

function normalizeService(raw: unknown): AgentError['service'] {
  return typeof raw === 'string' && SERVICE_WHITELIST.has(raw as AgentError['service'])
    ? (raw as AgentError['service'])
    : 'internal'
}

/**
 * Convert an HttpError thrown by the IA client into an AgentError.
 *
 * Two paths:
 * 1. The IA upstream returned a typed body (`{ detail: { code, service,
 *    user_message } }`) — we pass the code through unchanged so an
 *    `CLAUDE_OUTPUT_TRUNCATED` raised in Python surfaces with the same code
 *    in TypeScript. `severity` is derived from `err.retryable` (5xx → recoverable,
 *    other 4xx → terminal).
 * 2. The body is opaque (gateway error, network shim) — fall back to the
 *    registry-defined HTTP codes (`HTTP_UNAVAILABLE` recoverable,
 *    `HTTP_REJECTED` terminal).
 */
const MAX_CAUSE_DEPTH = 3

export function agentErrorFromHttpError(err: HttpErrorLike): AgentError {
  const severity: AgentError['severity'] = err.retryable ? 'recoverable' : 'terminal'
  const retryable = err.retryable

  const detail = tryExtractTypedDetail(err.body)
  if (detail) {
    return {
      code: detail.code!,
      service: normalizeService(detail.service),
      severity,
      retryable,
      user_message: detail.user_message!,
      debug_message: `HTTP ${err.status} on ${err.endpoint}: ${err.body.slice(0, 200)}`,
      context: { status: err.status, endpoint: err.endpoint },
      cause: err.cause ? agentErrorFromUnknown(err.cause, MAX_CAUSE_DEPTH - 1) : undefined,
    }
  }

  return {
    code: err.retryable ? 'HTTP_UNAVAILABLE' : 'HTTP_REJECTED',
    service: 'internal',
    severity,
    retryable,
    user_message: err.retryable
      ? 'Service indisponible. Nouvelle tentative en cours.'
      : "Le service a refusé la requête. L'équipe a été notifiée.",
    debug_message: `HTTP ${err.status} on ${err.endpoint}${err.body ? `: ${err.body.slice(0, 200)}` : ''}`,
    context: { status: err.status, endpoint: err.endpoint },
    cause: err.cause ? agentErrorFromUnknown(err.cause, MAX_CAUSE_DEPTH - 1) : undefined,
  }
}

/**
 * Catch-all for un-typed errors. Always maps to `AGENT_INTERNAL`. Use at
 * agent boundaries so no raw exception escapes the envelope. The cause chain
 * is bounded to `MAX_CAUSE_DEPTH` levels so cycles and pathological wrappers
 * can't blow the stack or the payload.
 */
export function agentErrorFromUnknown(err: unknown, depth: number = MAX_CAUSE_DEPTH): AgentError {
  const message =
    err instanceof Error
      ? `${err.name}: ${err.message}`
      : typeof err === 'string'
        ? err
        : (() => {
            try {
              return JSON.stringify(err)
            } catch {
              return String(err)
            }
          })()

  const cause =
    depth > 0 && err instanceof Error && err.cause !== undefined && err.cause !== err
      ? agentErrorFromUnknown(err.cause, depth - 1)
      : undefined

  return {
    code: 'AGENT_INTERNAL',
    service: 'internal',
    severity: 'terminal',
    retryable: false,
    user_message: "Erreur interne. L'équipe a été notifiée.",
    debug_message: message,
    cause,
  }
}
