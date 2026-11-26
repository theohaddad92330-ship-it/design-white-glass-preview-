import { describe, expect, it } from 'vitest'
import { chatConversationLegalHoldSchema, isLegalHoldReviewOverdue } from './chat-conversation.js'

describe('#2439.13 — poser une conservation légale avec un délai de revue', () => {
  it('accepte reviewBy absent (aucun délai — comportement inchangé)', () => {
    const result = chatConversationLegalHoldSchema.safeParse({ conversationId: 'c1', hold: true, reason: 'litige' })
    expect(result.success).toBe(true)
  })

  it('accepte reviewBy quand il est fourni avec une raison', () => {
    const result = chatConversationLegalHoldSchema.safeParse({
      conversationId: 'c1',
      hold: true,
      reason: 'litige',
      reviewBy: '2027-01-01T00:00:00.000Z',
    })
    expect(result.success).toBe(true)
  })

  it('refuse un reviewBy qui n’est pas une date', () => {
    const result = chatConversationLegalHoldSchema.safeParse({
      conversationId: 'c1',
      hold: true,
      reason: 'litige',
      reviewBy: 'bientôt',
    })
    expect(result.success).toBe(false)
  })

  it('ignore reviewBy pour lever la conservation, même règle que reason', () => {
    const result = chatConversationLegalHoldSchema.safeParse({ conversationId: 'c1', hold: false })
    expect(result.success).toBe(true)
  })
})

describe('#2439.13 — isLegalHoldReviewOverdue, calcul pur', () => {
  const now = new Date('2027-06-01T00:00:00.000Z')

  it('dit NON tant qu’aucune date de revue n’a été posée', () => {
    expect(isLegalHoldReviewOverdue(null, now)).toBe(false)
  })

  it('dit NON avant la date de revue', () => {
    expect(isLegalHoldReviewOverdue('2027-06-02T00:00:00.000Z', now)).toBe(false)
  })

  it('dit OUI le jour même de la date de revue', () => {
    expect(isLegalHoldReviewOverdue('2027-06-01T00:00:00.000Z', now)).toBe(true)
  })

  it('dit OUI après la date de revue', () => {
    expect(isLegalHoldReviewOverdue('2027-01-01T00:00:00.000Z', now)).toBe(true)
  })
})
