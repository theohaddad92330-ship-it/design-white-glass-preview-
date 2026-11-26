import { describe, expect, it } from 'vitest'

import { agentEnvelopeSchema } from './agent-envelope.js'
import { apolloSearchHitSchema, apolloSourceStatusSchema, contactsDataSchema } from './contacts-data.js'

describe('apolloSearchHitSchema', () => {
  it('accepts a minimal hit', () => {
    expect(apolloSearchHitSchema.parse({})).toEqual({})
  })

  it('accepts a fully populated hit', () => {
    const result = apolloSearchHitSchema.parse({
      firstName: 'Jean',
      lastName: 'Dupont',
      title: 'DSI',
      organizationName: 'SNCF SA',
      linkedinUrl: 'https://linkedin.com/in/jdoe',
      city: 'Paris',
      country: 'France',
    })
    expect(result.firstName).toBe('Jean')
    expect(result.organizationName).toBe('SNCF SA')
  })

  // #2755.1 — jumeau : `_apollo_hit_to_seed`/`_fallback_contact_to_seed`
  // (apps/ia/app/routers/phase2_contacts.py:394-398, 427-429, 946-948) posent
  // `title`/`linkedinUrl`/`city`/`country` à `None` explicite (`hit.title or
  // None`) quand le champ est vide — jamais une clé absente. `.optional()`
  // refuse ce `null`, exactement le défaut qui a cassé `orgGraphSchema` sur
  // SOPRA STERIA GROUP (#2755.1).
  it('#2755.1 -- accepts title/linkedinUrl/city/country at null (le producteur pose la clé même vide)', () => {
    const result = apolloSearchHitSchema.parse({
      firstName: 'Jean',
      title: null,
      linkedinUrl: null,
      city: null,
      country: null,
    })
    expect(result.title).toBeNull()
    expect(result.linkedinUrl).toBeNull()
    expect(result.city).toBeNull()
    expect(result.country).toBeNull()
  })

  it('passes through unknown enrichment fields', () => {
    const result = apolloSearchHitSchema.parse({
      firstName: 'Jean',
      apolloPersonId: 'apl_xxx',
    }) as Record<string, unknown>
    expect(result.apolloPersonId).toBe('apl_xxx')
  })
})

describe('contactsDataSchema', () => {
  it('accepts a minimal payload with defaults', () => {
    const result = contactsDataSchema.parse({})
    expect(result.contacts).toEqual([])
    expect(result.count).toBe(0)
  })

  it('accepts contacts + count', () => {
    const result = contactsDataSchema.parse({
      contacts: [{ firstName: 'Jean' }, { firstName: 'Marie' }],
      count: 2,
    })
    expect(result.contacts).toHaveLength(2)
    expect(result.count).toBe(2)
  })

  it('rejects a negative count', () => {
    expect(() => contactsDataSchema.parse({ count: -1 })).toThrow()
  })

  it('#2543.5a -- sourceStatus/sourceTotalEntries are absent by default, never a guessed "ok"', () => {
    const result = contactsDataSchema.parse({})
    expect(result.sourceStatus).toBeUndefined()
    expect(result.sourceTotalEntries).toBeUndefined()
  })

  it('#2543.5a -- accepts every typed Apollo source status', () => {
    for (const status of ['ok', 'empty', 'unconfigured', 'auth_failed', 'plan_blocked', 'rate_limited', 'down']) {
      expect(apolloSourceStatusSchema.parse(status)).toBe(status)
    }
  })

  it('#2543.5a -- rejects an untyped source status (never guessed)', () => {
    expect(() => apolloSourceStatusSchema.parse('mostly_ok')).toThrow()
  })

  it('#2543.5b -- fallback carries attempted/foundCount/failure, additive', () => {
    const result = contactsDataSchema.parse({
      fallback: { attempted: true, foundCount: 2 },
    })
    expect(result.fallback).toEqual({ attempted: true, foundCount: 2 })
  })

  it('#2543.5b -- fallback.failure is a named string when the fallback raised', () => {
    const result = contactsDataSchema.parse({
      fallback: { attempted: true, failure: 'brave timeout' },
    })
    expect(result.fallback?.failure).toBe('brave timeout')
  })

  it('#2543.5b -- fallback.foundCount stays absent (not 0) when the fallback never completed', () => {
    const result = contactsDataSchema.parse({ fallback: { attempted: true } })
    expect(result.fallback?.foundCount).toBeUndefined()
  })

  it('#2543.5g -- widened is absent by default, never a guessed "not attempted"', () => {
    const result = contactsDataSchema.parse({})
    expect(result.widened).toBeUndefined()
  })

  it('#2543.5g -- widened carries attempted/initialStock/added, additive', () => {
    const result = contactsDataSchema.parse({
      widened: { attempted: true, initialStock: 5, added: 3 },
    })
    expect(result.widened).toEqual({ attempted: true, initialStock: 5, added: 3 })
  })

  it('#2543.5g -- widened.added is 0 (not absent) when the pass found nothing', () => {
    const result = contactsDataSchema.parse({
      widened: { attempted: true, initialStock: 5, added: 0 },
    })
    expect(result.widened?.added).toBe(0)
  })

  it('composes with agentEnvelopeSchema for a typed envelope', () => {
    const envelopeSchema = agentEnvelopeSchema(contactsDataSchema)
    const result = envelopeSchema.parse({
      status: 'partial_success',
      data: { contacts: [], count: 0 },
      error: null,
      meta: {
        agent_name: 'contact_hunter',
        agent_version: '1.0.0',
        correlation_id: 'cid',
        started_at: '2026-05-26T10:00:00.000Z',
        finished_at: '2026-05-26T10:00:01.000Z',
        duration_ms: 1000,
        source_health: { apollo: 'degraded' },
        warnings: [
          {
            code: 'APOLLO_EMPTY',
            message: 'Aucun contact trouvé.',
          },
        ],
      },
    })
    expect(result.data?.count).toBe(0)
    expect(result.meta.source_health).toEqual({ apollo: 'degraded' })
  })
})
