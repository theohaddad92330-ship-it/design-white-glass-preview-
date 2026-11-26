import { describe, expect, it } from 'vitest'
import { AUDIT_STALE_AFTER_DAYS, auditFreshness } from './audit-freshness'

const NOW = new Date('2026-09-21T00:00:00.000Z')

/** Une date à N jours dans le passé, au format ISO. */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

describe("auditFreshness — #2084.14 « l'audit date, il n'est jamais jugé »", () => {
  it("rend `unknown` sur une absence d'instantané — jamais une fausse fraîcheur", () => {
    for (const absent of [null, '']) {
      expect(auditFreshness(absent, NOW)).toEqual({ state: 'unknown', updatedAt: null, ageDays: null })
    }
  })

  it('rend `unknown` sur une date ILLISIBLE — jamais un 0 jour', () => {
    expect(auditFreshness('bientôt', NOW)).toEqual({ state: 'unknown', updatedAt: null, ageDays: null })
  })

  it('rend `fresh` en deçà du seuil, avec la date ET l’âge mesurés', () => {
    const updatedAt = daysAgo(10)
    expect(auditFreshness(updatedAt, NOW)).toEqual({ state: 'fresh', updatedAt, ageDays: 10 })
  })

  it('rend `stale` au seuil ET au-delà (borne incluse)', () => {
    const atThreshold = daysAgo(AUDIT_STALE_AFTER_DAYS)
    expect(auditFreshness(atThreshold, NOW)).toEqual({
      state: 'stale',
      updatedAt: atThreshold,
      ageDays: AUDIT_STALE_AFTER_DAYS,
    })

    const beyond = daysAgo(AUDIT_STALE_AFTER_DAYS + 40)
    expect(auditFreshness(beyond, NOW).state).toBe('stale')
  })

  it('une date FUTURE (horloge décalée) rend un âge de 0 jour, jamais négatif', () => {
    const future = new Date(NOW.getTime() + 5 * 86_400_000).toISOString()
    expect(auditFreshness(future, NOW)).toEqual({ state: 'fresh', updatedAt: future, ageDays: 0 })
  })
})
