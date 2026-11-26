import { describe, expect, it } from 'vitest'

import { agentEnvelopeSchema } from './agent-envelope.js'
import { messageBundleSchema, messengerDataSchema } from './messenger-data.js'

describe('messageBundleSchema', () => {
  it('accepts a minimal bundle', () => {
    expect(messageBundleSchema.parse({})).toEqual({})
  })

  it('accepts a typed bundle with pitch + icebreaker', () => {
    const result = messageBundleSchema.parse({
      contact: 'Jean Dupont',
      messages: { pitch: '...', icebreaker: '...' },
    })
    expect(result.contact).toBe('Jean Dupont')
    expect(result.messages).toEqual({ pitch: '...', icebreaker: '...' })
  })
})

describe('messengerDataSchema', () => {
  it('defaults messages to []', () => {
    expect(messengerDataSchema.parse({})).toEqual({ messages: [] })
  })

  it('accepts a list of bundles', () => {
    const result = messengerDataSchema.parse({
      messages: [
        { contact: 'Jean', messages: { pitch: 'x' } },
        { contact: 'Marie', messages: { pitch: 'y' } },
      ],
    })
    expect(result.messages).toHaveLength(2)
  })

  it('composes with agentEnvelopeSchema for partial_success', () => {
    const envelopeSchema = agentEnvelopeSchema(messengerDataSchema)
    const result = envelopeSchema.parse({
      status: 'partial_success',
      data: { messages: [{ contact: 'Jean', messages: { pitch: 'x' } }] },
      error: null,
      meta: {
        agent_name: 'messenger',
        agent_version: '1.0.0',
        correlation_id: 'cid',
        started_at: '2026-05-26T10:00:00.000Z',
        finished_at: '2026-05-26T10:00:01.000Z',
        duration_ms: 1000,
        warnings: [
          {
            code: 'MESSENGER_CONTACT_FAILED',
            message: 'Génération du message pour Marie a échoué.',
            context: { contact: 'Marie' },
          },
        ],
      },
    })
    expect(result.data?.messages).toHaveLength(1)
    expect(result.meta.warnings?.[0].code).toBe('MESSENGER_CONTACT_FAILED')
  })

  it('passes through unknown fields', () => {
    const result = messengerDataSchema.parse({
      messages: [],
      totalCost: 0.012,
    }) as Record<string, unknown>
    expect(result.totalCost).toBe(0.012)
  })
})
