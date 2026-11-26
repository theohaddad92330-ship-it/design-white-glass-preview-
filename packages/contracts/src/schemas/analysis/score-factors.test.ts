import { describe, expect, it } from 'vitest'
import { parseAccountAnalysis } from './account-analysis.js'
import { PROOF_TYPES, planOutputSchema, proofTypeSchema, scoreFactorSchema } from './plan.js'
import { strategyDataSchema } from '../strategy-data.js'

describe('score axes (Théo P1 — score commercial ET confiance donnée)', () => {
  it('enumerates the five proof types', () => {
    expect([...PROOF_TYPES]).toEqual(['signal', 'source', 'contact', 'profile', 'business_rule'])
    expect(proofTypeSchema.parse('business_rule')).toBe('business_rule')
  })

  it('validates a factor tied to a proof, weight optional', () => {
    const factor = scoreFactorSchema.parse({
      label: 'Budget / investissement visible',
      proof_type: 'signal',
      weight: 4,
    })
    expect(factor.proof_type).toBe('signal')
    expect(factor.weight).toBe(4)
    // weight is optional — a factor without a numeric weight still parses.
    expect(scoreFactorSchema.parse({ label: 'x', proof_type: 'contact' }).weight).toBeUndefined()
  })

  it('keeps an unknown future proof type as a string rather than dropping it', () => {
    expect(scoreFactorSchema.parse({ label: 'y', proof_type: 'future_kind' }).proof_type).toBe('future_kind')
  })

  it('parses the two axes + factors on the plan output', () => {
    const plan = planOutputSchema.parse({
      commercial_score: 80,
      data_confidence: 62,
      score_factors: [
        { label: 'Accessibilité commerciale', proof_type: 'contact', weight: 5 },
        { label: 'Verdict GO — règle /25', proof_type: 'business_rule', weight: 21 },
      ],
    })
    expect(plan.commercial_score).toBe(80)
    expect(plan.data_confidence).toBe(62)
    expect(plan.score_factors).toHaveLength(2)
  })

  it('is backward-compatible: a plan without the axes still parses', () => {
    const plan = planOutputSchema.parse({ evaluation: { global_score: 7 } })
    expect(plan.commercial_score).toBeUndefined()
    expect(plan.score_factors).toBeUndefined()
  })

  it('surfaces the axes through parseAccountAnalysis from a camelCase plan wire shape', () => {
    // The IA emits camelCase under raw_analysis.plan; parseAccountAnalysis
    // snake-cases the containers while the factor keys (proof_type) stay.
    const analysis = parseAccountAnalysis({
      plan: {
        commercialScore: 80,
        dataConfidence: 55,
        scoreFactors: [{ label: 'Urgence business', proof_type: 'signal', weight: 4 }],
      },
    })
    expect(analysis.plan?.commercial_score).toBe(80)
    expect(analysis.plan?.data_confidence).toBe(55)
    expect(analysis.plan?.score_factors?.[0]?.proof_type).toBe('signal')
  })

  it('parses the camelCase strategy-data (phase-4) wire shape', () => {
    const data = strategyDataSchema.parse({
      commercialScore: 80,
      dataConfidence: null,
      scoreFactors: [{ label: 'Fit avec l’offre ESN', proof_type: 'profile', weight: 4 }],
    })
    expect(data.commercialScore).toBe(80)
    expect(data.dataConfidence).toBeNull()
    expect(data.scoreFactors?.[0]?.proof_type).toBe('profile')
  })
})
