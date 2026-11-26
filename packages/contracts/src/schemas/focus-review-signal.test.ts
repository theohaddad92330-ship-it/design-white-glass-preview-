import { describe, expect, it } from 'vitest'
import { focusReviewSignalSchema } from './focus-review-signal.js'

describe('focusReviewSignalSchema (#3262.23, épopée #3284)', () => {
  it('accepte un compte Focus stagnant, avec sa recommandation', () => {
    const parsed = focusReviewSignalSchema.parse({
      applicable: true,
      companyName: 'Acme',
      stale: true,
      daysInFocus: 45,
      recommendation: 'Trente jours sans mouvement : l’effort maximum n’est pas éternel.',
      suggestedLevel: 'extension',
    })
    expect(parsed.stale).toBe(true)
    expect(parsed.suggestedLevel).toBe('extension')
  })

  it('accepte un compte Focus récent — pas encore stagnant', () => {
    const parsed = focusReviewSignalSchema.parse({
      applicable: true,
      companyName: 'Acme',
      stale: false,
      daysInFocus: 5,
      recommendation: null,
      suggestedLevel: null,
    })
    expect(parsed.stale).toBe(false)
  })

  it('accepte un compte hors Focus — non applicable, jamais un zéro deviné', () => {
    const parsed = focusReviewSignalSchema.parse({
      applicable: false,
      companyName: 'Acme',
      stale: null,
      daysInFocus: null,
      recommendation: null,
      suggestedLevel: null,
    })
    expect(parsed.applicable).toBe(false)
    expect(parsed.daysInFocus).toBeNull()
  })

  it('refuse un jour négatif', () => {
    expect(() =>
      focusReviewSignalSchema.parse({
        applicable: true,
        companyName: 'Acme',
        stale: false,
        daysInFocus: -1,
        recommendation: null,
        suggestedLevel: null,
      }),
    ).toThrow()
  })

  it('refuse un niveau de sprint hors énumération', () => {
    expect(() =>
      focusReviewSignalSchema.parse({
        applicable: true,
        companyName: 'Acme',
        stale: true,
        daysInFocus: 45,
        recommendation: 'x',
        suggestedLevel: 'invented_level',
      }),
    ).toThrow()
  })

  it('#3262.20/.21 — accepte la prochaine revue et les évènements de réactivation', () => {
    const parsed = focusReviewSignalSchema.parse({
      applicable: false,
      companyName: 'Acme',
      stale: null,
      daysInFocus: null,
      recommendation: null,
      suggestedLevel: null,
      nextReview: { dueAt: '2026-11-15T00:00:00.000Z', source: 'relationship_memory' },
      reactivation: [{ event: 'positive_reply', suggestedLevel: 'extension', reason: 'x', reopensGate: true }],
    })
    expect(parsed.reactivation?.[0]?.reopensGate).toBe(true)
  })

  it('#3262.20 — refuse une source de revue inconnue', () => {
    expect(() =>
      focusReviewSignalSchema.parse({
        applicable: false,
        companyName: 'Acme',
        stale: null,
        daysInFocus: null,
        recommendation: null,
        suggestedLevel: null,
        nextReview: { dueAt: '2026-11-15T00:00:00.000Z', source: 'devine' },
      }),
    ).toThrow()
  })
})
