import { describe, expect, it } from 'vitest'
import {
  RESEAU_FRESHNESS_ANSWER_KEYS,
  RESEAU_FRESHNESS_STALE_AFTER_DAYS,
  readReseauFreshness,
} from './onboarding-reseau-freshness.js'

const NOW = new Date('2026-09-24T00:00:00.000Z')
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * 86_400_000).toISOString()

// #2045.15 — un contact ancien n'est pas un accès actif : le réseau personnel
// déclaré (#2045.1/.2/.4/.6/.7) porte sa date, même primitive que l'effectif
// (#2035.8), même colonne (`effectif_observed_at`), seuil DISTINCT.
describe('readReseauFreshness', () => {
  it('dit NON à une réponse jamais observée : `null` rend never_observed, jamais 0 jour', () => {
    expect(readReseauFreshness(null, NOW)).toEqual({ state: 'never_observed', observedAt: null, ageDays: null })
    expect(readReseauFreshness(undefined, NOW)).toEqual({ state: 'never_observed', observedAt: null, ageDays: null })
  })

  it('dit NON à une date illisible : never_observed, jamais une exception ni un âge inventé', () => {
    expect(readReseauFreshness('pas une date', NOW)).toEqual({
      state: 'never_observed',
      observedAt: null,
      ageDays: null,
    })
  })

  it('protège le cas légitime : une réponse d’hier est fraîche, avec son âge exact', () => {
    const observedAt = daysAgo(1)
    expect(readReseauFreshness(observedAt, NOW)).toEqual({ state: 'fresh', observedAt, ageDays: 1 })
  })

  it('reste fraîche juste sous le seuil (179 jours < 180)', () => {
    const observedAt = daysAgo(RESEAU_FRESHNESS_STALE_AFTER_DAYS - 1)
    expect(readReseauFreshness(observedAt, NOW).state).toBe('fresh')
  })

  it('bascule stale exactement au seuil (180 jours) — cadence org-freshness.ts, pas celle de l’effectif (90j)', () => {
    const observedAt = daysAgo(RESEAU_FRESHNESS_STALE_AFTER_DAYS)
    const result = readReseauFreshness(observedAt, NOW)
    expect(result.state).toBe('stale')
    expect(result.ageDays).toBe(RESEAU_FRESHNESS_STALE_AFTER_DAYS)
  })

  it('reste stale bien au-delà du seuil', () => {
    const observedAt = daysAgo(400)
    const result = readReseauFreshness(observedAt, NOW)
    expect(result.state).toBe('stale')
    expect(result.ageDays).toBe(400)
  })

  it('une date future (horloge décalée) rend un âge de 0, jamais négatif', () => {
    const future = new Date(NOW.getTime() + 5 * 86_400_000).toISOString()
    const result = readReseauFreshness(future, NOW)
    expect(result.ageDays).toBe(0)
    expect(result.state).toBe('fresh')
  })

  it('couvre les quatre portes de réseau PERSISTÉES (#2045.1/.2/.4/.7), pas `warm_relations_count_band` (#2045.6, sans colonne à ce jour)', () => {
    expect([...RESEAU_FRESHNESS_ANSWER_KEYS].sort()).toEqual(
      [
        'former_clients_count_band',
        'former_colleagues_count_band',
        'partners_count_band',
        'referrers_count_band',
      ].sort(),
    )
  })
})
