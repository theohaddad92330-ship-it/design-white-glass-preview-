import { describe, expect, it } from 'vitest'

import { agentEnvelopeSchema } from './agent-envelope.js'
import { evaluationSchema, strategyDataSchema } from './strategy-data.js'

describe('evaluationSchema', () => {
  it('rejects globalScore out of [0, 10]', () => {
    expect(() => evaluationSchema.parse({ globalScore: 11 })).toThrow()
    expect(() => evaluationSchema.parse({ globalScore: -1 })).toThrow()
  })

  it('accepts the typed fields', () => {
    const result = evaluationSchema.parse({
      goNoGo: 'GO',
      globalScore: 8,
      justification: '...',
      risks: [{ risk: 'délai', impact: 'modere' }],
    })
    expect(result.goNoGo).toBe('GO')
    expect(result.globalScore).toBe(8)
  })
})

describe('strategyDataSchema', () => {
  it('accepts a minimal payload', () => {
    expect(strategyDataSchema.parse({})).toEqual({})
  })

  it('accepts a fully populated payload', () => {
    const result = strategyDataSchema.parse({
      actionPlan: { strategy: 'bottom-up', justification: '...' },
      offersToPropose: [{ title: 'Audit DSI', pitch: '...' }],
      quickWins: [{ action: 'envoyer un brief' }],
      evaluation: { goNoGo: 'GO', globalScore: 8 },
      prioritySubAccounts: [{ name: 'BU Voyageurs', why: '...' }],
      competitiveStrategy: { positioningStatement: 'expertise rare' },
    })
    expect(result.actionPlan?.strategy).toBe('bottom-up')
    expect(result.offersToPropose?.[0].title).toBe('Audit DSI')
    expect(result.evaluation?.globalScore).toBe(8)
  })

  it('exposes ifNoResponse with camelCase', () => {
    const result = strategyDataSchema.parse({
      ifNoResponse: { trigger: 'no reply 7d' },
    })
    expect(result.ifNoResponse).toEqual({ trigger: 'no reply 7d' })
  })

  it('still parses (via passthrough) the legacy snake_case `if_no_response` key', () => {
    // The Python prompt + Pydantic emit `if_no_response`. Captured by
    // .passthrough() until the prompt is renamed in a follow-up.
    const result = strategyDataSchema.parse({
      if_no_response: { trigger: 'no reply 7d' },
    }) as Record<string, unknown>
    expect(result.if_no_response).toEqual({ trigger: 'no reply 7d' })
    expect((result as { ifNoResponse?: unknown }).ifNoResponse).toBeUndefined()
  })

  it('composes with agentEnvelopeSchema for a typed envelope', () => {
    const envelopeSchema = agentEnvelopeSchema(strategyDataSchema)
    const result = envelopeSchema.parse({
      status: 'success',
      data: { actionPlan: { strategy: 'multi-thread' } },
      error: null,
      meta: {
        agent_name: 'strategist',
        agent_version: '1.0.0',
        correlation_id: 'cid',
        started_at: '2026-05-26T10:00:00.000Z',
        finished_at: '2026-05-26T10:00:01.000Z',
        duration_ms: 1000,
        prompt_name: 'bellum_plan',
      },
    })
    expect(result.data?.actionPlan?.strategy).toBe('multi-thread')
  })

  it('passes through unknown enrichment fields', () => {
    const result = strategyDataSchema.parse({
      futureField: { foo: 'bar' },
    }) as Record<string, unknown>
    expect(result.futureField).toEqual({ foo: 'bar' })
  })
})
