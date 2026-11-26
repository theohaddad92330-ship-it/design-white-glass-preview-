import { describe, expect, it } from 'vitest'
import {
  FRAMING_DECISIONS,
  FRAMING_ORIENTATION_IDS,
  framingStateResponseSchema,
  saveFramingDecisionSchema,
  validateFramingSchema,
} from './framing.js'

// Théo O onboarding-relecture.N1/N2 — la décision par orientation et la validation explicite du cadrage.
describe('framing', () => {
  it('connaît trois décisions : retenir, plus tard, écarter', () => {
    expect(FRAMING_DECISIONS).toEqual(['retain', 'later', 'dismiss'])
  })

  it('connaît trois orientations', () => {
    expect(FRAMING_ORIENTATION_IDS).toEqual(['proof', 'offer_split', 'decision_review'])
  })

  it('refuse une décision inventée', () => {
    expect(saveFramingDecisionSchema.safeParse({ decision: 'maybe' }).success).toBe(false)
    expect(saveFramingDecisionSchema.safeParse({ decision: 'retain' }).success).toBe(true)
  })

  it('exige une empreinte pour valider', () => {
    expect(validateFramingSchema.safeParse({}).success).toBe(false)
    expect(validateFramingSchema.safeParse({ digest: 'a'.repeat(64) }).success).toBe(true)
  })

  it('un état sans validation ni décision est un état valide (rien n’est inventé)', () => {
    expect(
      framingStateResponseSchema.safeParse({ decisions: {}, validated_at: null, validated_digest: null }).success,
    ).toBe(true)
  })
})
