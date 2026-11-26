import { describe, expect, it } from 'vitest'
import {
  EFFECTIF_FRESHNESS_ANSWER_KEYS,
  EFFECTIF_FRESHNESS_STALE_AFTER_DAYS,
  readEffectifFreshness,
} from './onboarding-effectif-freshness.js'

const NOW = new Date('2026-09-18T00:00:00.000Z')
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * 86_400_000).toISOString()

// #2035.8 — l'effectif porte sa date, et redevient inconnu en vieillissant.
describe('readEffectifFreshness', () => {
  it('dit NON à une réponse jamais observée : `null` rend never_observed, jamais 0 jour', () => {
    expect(readEffectifFreshness(null, NOW)).toEqual({ state: 'never_observed', observedAt: null, ageDays: null })
    expect(readEffectifFreshness(undefined, NOW)).toEqual({ state: 'never_observed', observedAt: null, ageDays: null })
  })

  it('dit NON à une date illisible : never_observed, jamais une exception ni un âge inventé', () => {
    expect(readEffectifFreshness('pas une date', NOW)).toEqual({
      state: 'never_observed',
      observedAt: null,
      ageDays: null,
    })
  })

  it('protège le cas légitime : une réponse d’hier est fraîche, avec son âge exact', () => {
    const observedAt = daysAgo(1)
    expect(readEffectifFreshness(observedAt, NOW)).toEqual({ state: 'fresh', observedAt, ageDays: 1 })
  })

  it('reste fraîche juste sous le seuil (89 jours < 90)', () => {
    const observedAt = daysAgo(EFFECTIF_FRESHNESS_STALE_AFTER_DAYS - 1)
    expect(readEffectifFreshness(observedAt, NOW).state).toBe('fresh')
  })

  it('bascule stale exactement au seuil (90 jours)', () => {
    const observedAt = daysAgo(EFFECTIF_FRESHNESS_STALE_AFTER_DAYS)
    const result = readEffectifFreshness(observedAt, NOW)
    expect(result.state).toBe('stale')
    expect(result.ageDays).toBe(EFFECTIF_FRESHNESS_STALE_AFTER_DAYS)
  })

  it('reste stale bien au-delà du seuil', () => {
    const observedAt = daysAgo(400)
    const result = readEffectifFreshness(observedAt, NOW)
    expect(result.state).toBe('stale')
    expect(result.ageDays).toBe(400)
  })

  it('une date future (horloge décalée) rend un âge de 0, jamais négatif', () => {
    const future = new Date(NOW.getTime() + 5 * 86_400_000).toISOString()
    const result = readEffectifFreshness(future, NOW)
    expect(result.ageDays).toBe(0)
    expect(result.state).toBe('fresh')
  })

  it('couvre les cinq bandes d’effectif déclarées, ni plus ni moins', () => {
    expect([...EFFECTIF_FRESHNESS_ANSWER_KEYS].sort()).toEqual(
      [
        'consultant_size',
        'consultant_size_group_band',
        'consultant_size_business_unit_band',
        'consultants_managed_by_user_band',
        'available_consultants_band',
      ].sort(),
    )
  })
})
