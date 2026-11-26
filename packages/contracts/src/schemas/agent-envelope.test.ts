import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  agentEnvelopeSchema,
  agentErrorSchema,
  agentMetaSchema,
  agentStatusSchema,
  errorServiceSchema,
  unknownAgentEnvelopeSchema,
} from './agent-envelope.js'

/**
 * Loads `agent_docs/agent-contract.fixtures.json` (the shared fixture also parsed by the
 * Pydantic test in `apps/ia/tests/test_agent_envelope.py`). Each `valid` payload must
 * parse, each `invalid` payload must be rejected — parity comes from the shared file,
 * not from duplicated test cases.
 */
const here = fileURLToPath(new URL('.', import.meta.url))
const fixturesPath = resolve(here, '../../../../agent_docs/agent-contract.fixtures.json')
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf-8')) as {
  valid: Record<string, unknown>
  invalid: Record<string, { envelope: unknown; $reason: string }>
}

// ── Round-trip parity against the shared fixture ────────────────────────────

describe('AgentEnvelope — valid fixtures', () => {
  it.each(Object.keys(fixtures.valid))('parses %s', key => {
    const result = unknownAgentEnvelopeSchema.safeParse(fixtures.valid[key])
    if (!result.success) {
      throw new Error(`Expected ${key} to parse, got: ${JSON.stringify(result.error.format(), null, 2)}`)
    }
    expect(result.data.status).toBe(key)
  })

  it('round-trips success without losing fields', () => {
    const parsed = unknownAgentEnvelopeSchema.parse(fixtures.valid.success)
    const roundtrip = unknownAgentEnvelopeSchema.parse(JSON.parse(JSON.stringify(parsed)))
    expect(roundtrip.meta.agent_name).toBe(parsed.meta.agent_name)
    expect(roundtrip.status).toBe(parsed.status)
  })
})

describe('AgentEnvelope — invalid fixtures', () => {
  it.each(Object.keys(fixtures.invalid))('rejects %s', key => {
    const { envelope } = fixtures.invalid[key]
    const result = unknownAgentEnvelopeSchema.safeParse(envelope)
    expect(result.success).toBe(false)
  })
})

// ── Direct invariant tests (mirror the Pydantic suite) ──────────────────────

const baseMeta = (overrides: Partial<Record<string, unknown>> = {}) => ({
  agent_name: 'researcher',
  agent_version: '1.0.0',
  correlation_id: 'test',
  started_at: '2026-05-26T10:00:00.000Z',
  finished_at: '2026-05-26T10:00:01.000Z',
  duration_ms: 1000,
  ...overrides,
})

const baseError = () => ({
  code: 'CLAUDE_UNKNOWN',
  service: 'claude',
  severity: 'terminal',
  retryable: false,
  user_message: 'Erreur Claude inattendue.',
  debug_message: 'boom',
})

describe('status / data / error invariant', () => {
  it('rejects success without data', () => {
    const result = unknownAgentEnvelopeSchema.safeParse({
      status: 'success',
      data: null,
      error: null,
      meta: baseMeta(),
    })
    expect(result.success).toBe(false)
  })

  it('rejects success with error', () => {
    const result = unknownAgentEnvelopeSchema.safeParse({
      status: 'success',
      data: { ok: true },
      error: baseError(),
      meta: baseMeta(),
    })
    expect(result.success).toBe(false)
  })

  it('rejects terminal_failure with data', () => {
    const result = unknownAgentEnvelopeSchema.safeParse({
      status: 'terminal_failure',
      data: { ok: true },
      error: baseError(),
      meta: baseMeta(),
    })
    expect(result.success).toBe(false)
  })

  it('rejects cancelled with error', () => {
    const result = unknownAgentEnvelopeSchema.safeParse({
      status: 'cancelled',
      data: null,
      error: baseError(),
      meta: baseMeta(),
    })
    expect(result.success).toBe(false)
  })

  it('rejects partial_success without warnings', () => {
    const result = unknownAgentEnvelopeSchema.safeParse({
      status: 'partial_success',
      data: { ok: true },
      error: null,
      meta: baseMeta(),
    })
    expect(result.success).toBe(false)
  })
})

describe('retryable / severity coherence', () => {
  it('rejects severity=terminal with retryable=true', () => {
    const result = agentErrorSchema.safeParse({
      code: 'CLAUDE_UNKNOWN',
      service: 'claude',
      severity: 'terminal',
      retryable: true,
      user_message: 'x',
      debug_message: 'y',
    })
    expect(result.success).toBe(false)
  })

  it('rejects severity=recoverable with retryable=false', () => {
    const result = agentErrorSchema.safeParse({
      code: 'CLAUDE_RATE_LIMITED',
      service: 'claude',
      severity: 'recoverable',
      retryable: false,
      user_message: 'x',
      debug_message: 'y',
    })
    expect(result.success).toBe(false)
  })
})

describe('meta constraints', () => {
  it('rejects non-snake_case agent_name', () => {
    const result = agentMetaSchema.safeParse(baseMeta({ agent_name: 'Researcher' }))
    expect(result.success).toBe(false)
  })

  it('rejects non-semver agent_version', () => {
    const result = agentMetaSchema.safeParse(baseMeta({ agent_version: '1.0' }))
    expect(result.success).toBe(false)
  })
})

describe('error cause chain', () => {
  it('nests AgentError as cause', () => {
    const result = agentErrorSchema.safeParse({
      code: 'AGENT_INTERNAL',
      service: 'internal',
      severity: 'terminal',
      retryable: false,
      user_message: 'Erreur interne.',
      debug_message: 'wrapper',
      cause: {
        code: 'CLAUDE_UNKNOWN',
        service: 'claude',
        severity: 'terminal',
        retryable: false,
        user_message: 'Erreur Claude inattendue.',
        debug_message: 'inner',
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('enums match contract', () => {
  it('AgentStatus values', () => {
    expect(agentStatusSchema.options).toEqual([
      'success',
      'partial_success',
      'recoverable_failure',
      'terminal_failure',
      'cancelled',
    ])
  })

  it('ErrorService values', () => {
    expect(errorServiceSchema.options).toEqual([
      'claude',
      'firecrawl',
      'brave',
      'apollo',
      'pappers',
      'supabase',
      'internal',
      'precondition',
    ])
  })
})

describe('typed envelope factory', () => {
  it('parses a typed data payload', () => {
    const userDataSchema = z.object({ companyName: z.string() })
    const schema = agentEnvelopeSchema(userDataSchema)
    const env = schema.parse({
      status: 'success',
      data: { companyName: 'Acme' },
      error: null,
      meta: baseMeta(),
    })
    expect(env.data?.companyName).toBe('Acme')
  })

  it('rejects a data payload that does not match the typed schema', () => {
    const userDataSchema = z.object({ companyName: z.string() })
    const schema = agentEnvelopeSchema(userDataSchema)
    const result = schema.safeParse({
      status: 'success',
      data: { companyName: 42 },
      error: null,
      meta: baseMeta(),
    })
    expect(result.success).toBe(false)
  })
})
