import { describe, expect, it } from 'vitest'
import { CONTACT_RULES_CAPABILITY, isContactRulesCatchupNeeded } from './segment-catchup.js'

// LUDOVIC-C LC.1 — STILL collecté le 12/10, avant le filtre d'homonymes du 19/10.
describe('LC.1 — isContactRulesCatchupNeeded', () => {
  it('concerné : collecte antérieure, jamais remise aux règles (ou jamais datée)', () => {
    expect(isContactRulesCatchupNeeded('2026-10-12T08:00:00.000Z', null)).toBe(true)
    expect(isContactRulesCatchupNeeded(null, null)).toBe(true)
  })
  it('dit NON après la remise aux règles, ou après une collecte postérieure à la capacité', () => {
    expect(isContactRulesCatchupNeeded('2026-10-12T08:00:00.000Z', '2026-10-20T07:00:00.000Z')).toBe(false)
    expect(isContactRulesCatchupNeeded('2026-10-19T12:00:00.000Z', null)).toBe(false)
  })
  it('la capacité est datée par un commit réel', () => {
    expect(CONTACT_RULES_CAPABILITY.commit).toMatch(/^[0-9a-f]{40}$/)
  })
})
