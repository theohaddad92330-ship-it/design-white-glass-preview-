import { describe, expect, it } from 'vitest'
import {
  COMMERCIAL_OUTCOME_TYPES,
  commercialOutcomeSchema,
  commercialOutcomeSummarySchema,
  createCommercialOutcomeSchema,
} from './commercial-outcome.js'

/**
 * #2126.47/.48/.50/.51/.53/.54/.55/.60 (épopée #2787) — le contrat de l'outcome
 * commercial. Sept types, jamais six (#2126.48 est un DOUBLE bipolaire).
 */
describe('COMMERCIAL_OUTCOME_TYPES', () => {
  it('porte exactement les sept outcomes nommés par l’épopée, dans cet ordre (GA-08)', () => {
    expect(COMMERCIAL_OUTCOME_TYPES).toEqual([
      'qualified_relationship',
      'partner_relevant',
      'partner_not_relevant',
      'incorrect_contact',
      'message_replied',
      'consultant_positioned',
      'declined',
    ])
  })
})

describe('createCommercialOutcomeSchema', () => {
  it('accepte un outcome de PORTÉE COMPTE (#2126.48/.54) — sans `contactId`', () => {
    const parsed = createCommercialOutcomeSchema.parse({ type: 'declined', reason: 'Budget déjà engagé' })
    expect(parsed.contactId).toBeUndefined()
  })

  it('accepte un outcome porté par un CONTACT (#2126.47/.50/.51/.53), sans raison', () => {
    const parsed = createCommercialOutcomeSchema.parse({
      type: 'message_replied',
      contactId: '11111111-1111-4111-8111-111111111111',
    })
    expect(parsed.reason).toBeUndefined()
  })

  it('refuse un type hors de la liste fermée', () => {
    expect(() => createCommercialOutcomeSchema.parse({ type: 'won_deal' })).toThrow()
  })

  it('refuse une clé inconnue (`.strict()`) — pas de champ deviné', () => {
    expect(() => createCommercialOutcomeSchema.parse({ type: 'declined', probability: 0.8 })).toThrow()
  })

  it('refuse une raison VIDE — `null`/absente porte l’absence, pas une chaîne blanche', () => {
    expect(() => createCommercialOutcomeSchema.parse({ type: 'declined', reason: '   ' })).toThrow()
  })
})

describe('commercialOutcomeSchema — #2126.60, le ledger est append-only', () => {
  it('n’a pas de champ `updatedAt` — un outcome ne se met jamais à jour', () => {
    expect(Object.keys(commercialOutcomeSchema.shape)).not.toContain('updatedAt')
  })

  it('accepte une ligne complète, `contactId` nul (portée compte)', () => {
    const parsed = commercialOutcomeSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      accountId: '22222222-2222-4222-8222-222222222222',
      contactId: null,
      type: 'partner_relevant',
      reason: null,
      recordedBy: '33333333-3333-4333-8333-333333333333',
      recordedAt: '2026-09-25T09:00:00.000Z',
    })
    expect(parsed.contactId).toBeNull()
  })
})

describe('commercialOutcomeSummarySchema — #2126.56/.58/.59, le substrat partagé', () => {
  it('accepte un compte par type et la liste des fiches marquées incorrectes', () => {
    const parsed = commercialOutcomeSummarySchema.parse({
      accountId: '11111111-1111-4111-8111-111111111111',
      counts: { incorrect_contact: 2, message_replied: 1 },
      incorrectContactIds: ['22222222-2222-4222-8222-222222222222'],
    })
    expect(parsed.counts.incorrect_contact).toBe(2)
  })
})
