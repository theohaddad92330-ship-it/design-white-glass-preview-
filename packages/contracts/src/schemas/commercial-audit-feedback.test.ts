import { describe, expect, it } from 'vitest'
import { createCommercialAuditFeedbackRequestSchema } from './commercial-audit-feedback.js'

describe('createCommercialAuditFeedbackRequestSchema — #2075.12 / #2075.13', () => {
  it('accepte un commentaire avec un texte non vide', () => {
    const result = createCommercialAuditFeedbackRequestSchema.safeParse({
      target_key: 'bottleneck',
      kind: 'comment',
      comment_text: 'On en a déjà parlé la semaine dernière.',
    })
    expect(result.success).toBe(true)
  })

  it('refuse un commentaire SANS texte — jamais une note vide', () => {
    const result = createCommercialAuditFeedbackRequestSchema.safeParse({
      target_key: 'bottleneck',
      kind: 'comment',
      comment_text: '   ',
    })
    expect(result.success).toBe(false)
  })

  it('accepte un refus SANS texte', () => {
    const result = createCommercialAuditFeedbackRequestSchema.safeParse({ target_key: 'stop', kind: 'refused' })
    expect(result.success).toBe(true)
  })

  it('refuse un `target_key` vide', () => {
    const result = createCommercialAuditFeedbackRequestSchema.safeParse({ target_key: '', kind: 'refused' })
    expect(result.success).toBe(false)
  })

  it('refuse un genre hors énumération', () => {
    const result = createCommercialAuditFeedbackRequestSchema.safeParse({ target_key: 'stop', kind: 'dismissed' })
    expect(result.success).toBe(false)
  })
})
