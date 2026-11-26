import { describe, expect, it } from 'vitest'

import { agentEnvelopeSchema } from './agent-envelope.js'
import { researchDataSchema } from './research-data.js'

describe('researchDataSchema', () => {
  it('accepts a minimal payload (everything optional)', () => {
    const result = researchDataSchema.parse({})
    expect(result).toEqual({})
  })

  it('accepts the known core fields', () => {
    const result = researchDataSchema.parse({
      businessDescription: 'Opérateur ferroviaire historique',
      sector: 'Transport',
      employees: '271000',
      revenue: '35400000000',
      siren: '552049447',
      entitiesExhaustive: [{ name: 'SNCF Voyageurs', type: 'filiale' }],
      pains: [{ pain: 'modernisation legacy', urgency: 'haute' }],
      priorityScore: 8,
    })
    expect(result.businessDescription).toBe('Opérateur ferroviaire historique')
    expect(result.siren).toBe('552049447')
    expect(result.priorityScore).toBe(8)
  })

  it('passes through unknown fields without rejecting them', () => {
    const result = researchDataSchema.parse({
      sector: 'Transport',
      // Pappers overlay fields not explicitly listed in the schema
      legal_form: 'SA',
      headquarters_display: '2 Place aux Étoiles, 93200 Saint-Denis',
      financials_history: [{ year: 2024, revenue: 35_400_000_000 }],
      cities: ['PARIS', 'LYON'],
      _api_metrics: { brave_results_count: 30 },
    })
    expect((result as Record<string, unknown>).legal_form).toBe('SA')
    expect((result as Record<string, unknown>)._api_metrics).toEqual({ brave_results_count: 30 })
  })

  it('accepts revenue as either string or number', () => {
    expect(researchDataSchema.parse({ revenue: '35400000000' }).revenue).toBe('35400000000')
    expect(researchDataSchema.parse({ revenue: 35_400_000_000 }).revenue).toBe(35_400_000_000)
  })

  it('rejects priorityScore that is not a number', () => {
    expect(() => researchDataSchema.parse({ priorityScore: 'high' })).toThrow()
  })

  it('exposes the new camelCase English keys', () => {
    const result = researchDataSchema.parse({
      concreteActivity: 'opère 15 000 trains/jour',
      itImplicationsForEsn: 'monitoring distribué 24/7',
      orgChartLogic: 'DSI groupe centralisé',
      accountOpeningStrategy: 'attaque bottom-up via la BU Voyageurs',
    })
    expect(result.concreteActivity).toBe('opère 15 000 trains/jour')
    expect(result.itImplicationsForEsn).toBe('monitoring distribué 24/7')
    expect(result.orgChartLogic).toBe('DSI groupe centralisé')
    expect(result.accountOpeningStrategy).toBe('attaque bottom-up via la BU Voyageurs')
  })

  it('still parses (via passthrough) the legacy keys the Python prompts emit today', () => {
    // Documents the wire drift: the prompt + Pydantic still produce these
    // older keys; consumers must cast through Record<string, unknown> until
    // the prompts are aligned with the schema in a follow-up ticket.
    const result = researchDataSchema.parse({
      concrete_activity: 'legacy snake_case',
      it_implications_for_esn: 'legacy snake_case',
      organigrammeLogic: 'legacy French',
      commentOuvrirCompte: 'legacy French',
    }) as Record<string, unknown>
    expect(result.concrete_activity).toBe('legacy snake_case')
    expect(result.it_implications_for_esn).toBe('legacy snake_case')
    expect(result.organigrammeLogic).toBe('legacy French')
    expect(result.commentOuvrirCompte).toBe('legacy French')
    // The typed accessors stay undefined — they're not the same field.
    const typed = result as unknown as { concreteActivity?: string; orgChartLogic?: string }
    expect(typed.concreteActivity).toBeUndefined()
    expect(typed.orgChartLogic).toBeUndefined()
  })

  it('composes with agentEnvelopeSchema for a typed envelope', () => {
    const envelopeSchema = agentEnvelopeSchema(researchDataSchema)
    const result = envelopeSchema.parse({
      status: 'success',
      data: { businessDescription: 'x', sector: 'IT' },
      error: null,
      meta: {
        agent_name: 'researcher',
        agent_version: '1.0.0',
        correlation_id: 'cid',
        started_at: '2026-05-26T10:00:00.000Z',
        finished_at: '2026-05-26T10:00:01.000Z',
        duration_ms: 1000,
      },
    })
    expect(result.data?.businessDescription).toBe('x')
  })
})
