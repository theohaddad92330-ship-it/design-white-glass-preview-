import { describe, expect, it } from 'vitest'

import { agentErrorFromHttpError, agentErrorFromUnknown, type HttpErrorLike } from './agent-error-adapters.js'
import { agentErrorSchema, type AgentError } from './agent-envelope.js'

/**
 * One test per code listed in the registry §5 of `agent_docs/agent-contract.md`
 * to make sure no code is silently dropped on a future refactor. The Python
 * counterpart in `apps/ia/tests/test_agent_error_adapters.py` mirrors this list
 * — keep them in sync.
 */

const httpErr = (overrides: Partial<HttpErrorLike>): HttpErrorLike => ({
  status: 500,
  body: '',
  retryable: true,
  endpoint: '/phase/1/research',
  ...overrides,
})

const typedDetailBody = (code: string, service: string, user_message: string): string =>
  JSON.stringify({ detail: { code, service, user_message } })

// ── Pass-through: upstream FastAPI body has a typed detail ──────────────────

describe('agentErrorFromHttpError — typed upstream detail', () => {
  it('passes CLAUDE_OUTPUT_TRUNCATED through from a 422', () => {
    const err = agentErrorFromHttpError(
      httpErr({
        status: 422,
        retryable: false,
        body: typedDetailBody('CLAUDE_OUTPUT_TRUNCATED', 'claude', "Réponse Claude tronquée. L'analyse a été annulée."),
      }),
    )
    expect(err.code).toBe('CLAUDE_OUTPUT_TRUNCATED')
    expect(err.service).toBe('claude')
    expect(err.severity).toBe('terminal')
    expect(err.retryable).toBe(false)
    expect(err.user_message).toMatch(/tronquée/)
  })

  it('passes FIRECRAWL_INSUFFICIENT_CREDITS through from a 402', () => {
    const err = agentErrorFromHttpError(
      httpErr({
        status: 402,
        retryable: false,
        body: typedDetailBody('FIRECRAWL_INSUFFICIENT_CREDITS', 'firecrawl', 'Quota de scraping épuisé.'),
      }),
    )
    expect(err.code).toBe('FIRECRAWL_INSUFFICIENT_CREDITS')
    expect(err.service).toBe('firecrawl')
    expect(err.severity).toBe('terminal')
  })

  it('normalizes an unknown service value to internal', () => {
    const err = agentErrorFromHttpError(
      httpErr({
        status: 422,
        retryable: false,
        body: typedDetailBody('SOMETHING_WEIRD', 'made_up_service', 'msg'),
      }),
    )
    expect(err.service).toBe('internal')
    expect(err.code).toBe('SOMETHING_WEIRD')
  })

  it('keeps severity coherent with retryable when the upstream body is typed', () => {
    const err = agentErrorFromHttpError(
      httpErr({
        status: 429,
        retryable: true,
        body: typedDetailBody('CLAUDE_RATE_LIMITED', 'claude', 'Surcharge Claude temporaire.'),
      }),
    )
    expect(err.severity).toBe('recoverable')
    expect(err.retryable).toBe(true)
  })
})

// ── Fallback: body has no typed detail ──────────────────────────────────────

describe('agentErrorFromHttpError — opaque body', () => {
  it('returns HTTP_UNAVAILABLE on retryable=true with empty body', () => {
    const err = agentErrorFromHttpError(httpErr({ status: 502, retryable: true, body: '' }))
    expect(err.code).toBe('HTTP_UNAVAILABLE')
    expect(err.severity).toBe('recoverable')
    expect(err.retryable).toBe(true)
    expect(err.service).toBe('internal')
  })

  it('returns HTTP_REJECTED on retryable=false with non-JSON body', () => {
    const err = agentErrorFromHttpError(httpErr({ status: 404, retryable: false, body: 'Not Found' }))
    expect(err.code).toBe('HTTP_REJECTED')
    expect(err.severity).toBe('terminal')
    expect(err.retryable).toBe(false)
  })

  it('returns the fallback when detail is missing code or user_message', () => {
    const err = agentErrorFromHttpError(
      httpErr({
        status: 500,
        retryable: true,
        body: JSON.stringify({ detail: { code: 'X' } }), // no user_message
      }),
    )
    expect(err.code).toBe('HTTP_UNAVAILABLE')
  })

  it('includes status and endpoint in context', () => {
    const err = agentErrorFromHttpError(httpErr({ status: 503, retryable: true, endpoint: '/phase/2/contacts' }))
    expect(err.context).toEqual({ status: 503, endpoint: '/phase/2/contacts' })
  })
})

// ── agentErrorFromUnknown ───────────────────────────────────────────────────

describe('agentErrorFromUnknown', () => {
  it('wraps a standard Error', () => {
    const err = agentErrorFromUnknown(new TypeError('oops'))
    expect(err.code).toBe('AGENT_INTERNAL')
    expect(err.service).toBe('internal')
    expect(err.severity).toBe('terminal')
    expect(err.retryable).toBe(false)
    expect(err.debug_message).toMatch(/TypeError/)
  })

  it('wraps a string', () => {
    const err = agentErrorFromUnknown('something broke')
    expect(err.code).toBe('AGENT_INTERNAL')
    expect(err.debug_message).toBe('something broke')
  })

  it('wraps an arbitrary plain object', () => {
    const err = agentErrorFromUnknown({ foo: 'bar' })
    expect(err.code).toBe('AGENT_INTERNAL')
    expect(err.debug_message).toBe('{"foo":"bar"}')
  })

  it('preserves the cause chain when present', () => {
    const inner = new Error('inner')
    const outer = new Error('outer') as Error & { cause: Error }
    outer.cause = inner
    const err = agentErrorFromUnknown(outer)
    expect(err.cause).toBeDefined()
    expect(err.cause?.debug_message).toMatch(/inner/)
  })

  it('does not recurse on a self-referencing cause', () => {
    const cyclic = new Error('cyclic') as Error & { cause: Error }
    cyclic.cause = cyclic
    // The call should terminate (no stack overflow).
    const err = agentErrorFromUnknown(cyclic)
    expect(err.code).toBe('AGENT_INTERNAL')
  })
})

// ── Invariant: every adapter output passes agentErrorSchema validation ──────

describe('invariant: every adapter output is contract-valid', () => {
  const samples: Array<[string, AgentError]> = [
    [
      'http typed detail terminal',
      agentErrorFromHttpError(
        httpErr({
          status: 422,
          retryable: false,
          body: typedDetailBody('CLAUDE_UNKNOWN', 'claude', 'msg'),
        }),
      ),
    ],
    [
      'http typed detail recoverable',
      agentErrorFromHttpError(
        httpErr({
          status: 429,
          retryable: true,
          body: typedDetailBody('CLAUDE_RATE_LIMITED', 'claude', 'msg'),
        }),
      ),
    ],
    ['http fallback recoverable', agentErrorFromHttpError(httpErr({ status: 502, retryable: true, body: '' }))],
    ['http fallback terminal', agentErrorFromHttpError(httpErr({ status: 404, retryable: false, body: '' }))],
    ['unknown error', agentErrorFromUnknown(new RangeError('x'))],
    ['unknown string', agentErrorFromUnknown('plain string')],
  ]

  it.each(samples)('parses %s through agentErrorSchema', (_label, err) => {
    const result = agentErrorSchema.safeParse(err)
    if (!result.success) {
      throw new Error(`Adapter produced contract-invalid AgentError: ${JSON.stringify(result.error.format(), null, 2)}`)
    }
  })
})
