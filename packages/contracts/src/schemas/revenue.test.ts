import { describe, expect, it } from 'vitest'
import { aggregateMargin, marginBelowThreshold, marginPercent } from './revenue.js'

describe('marginPercent', () => {
  it('calcule la marge quand les deux termes sont là', () => {
    expect(marginPercent(65_000, 45_000)).toBe(30.8)
  })

  it('rend `null` — jamais 0 — quand le coût est inconnu', () => {
    // « Marge nulle » et « on ne connaît pas le coût » mènent à deux décisions
    // opposées : renégocier, ou remplir une fiche.
    expect(marginPercent(65_000, null)).toBeNull()
    expect(marginPercent(null, 45_000)).toBeNull()
  })

  it('refuse de diviser par zéro plutôt que d’afficher « ∞ % »', () => {
    expect(marginPercent(0, 45_000)).toBeNull()
  })

  it('rend une marge NÉGATIVE telle quelle', () => {
    // Une mission à perte existe, et la cacher est la meilleure façon de la
    // laisser courir.
    expect(marginPercent(40_000, 50_000)).toBe(-25)
  })
})

describe('marginBelowThreshold', () => {
  it('n’alerte pas sur une marge inconnue', () => {
    expect(marginBelowThreshold(null, 20)).toBe(false)
  })

  it('n’alerte pas quand aucun seuil n’est réglé', () => {
    expect(marginBelowThreshold(5, null)).toBe(false)
  })

  it('alerte sous le seuil, et pas dessus', () => {
    expect(marginBelowThreshold(18, 20)).toBe(true)
    expect(marginBelowThreshold(20, 20)).toBe(false)
  })
})

describe('aggregateMargin', () => {
  it('pondère par les jours, pas par le nombre de missions', () => {
    // Une mission d'un jour ne pèse pas autant qu'une mission de vingt.
    const result = aggregateMargin([
      { dailyRateCents: 60_000, dailyCostCents: 30_000, days: 20 },
      { dailyRateCents: 60_000, dailyCostCents: 59_000, days: 1 },
    ])
    expect(result.marginPercent).toBe(47.7)
    expect(result.measured).toBe(2)
  })

  it('SORT du calcul ce qui n’est pas mesurable, et le compte', () => {
    const result = aggregateMargin([
      { dailyRateCents: 60_000, dailyCostCents: 30_000, days: 20 },
      { dailyRateCents: 60_000, dailyCostCents: null, days: 20 },
    ])
    expect(result.marginPercent).toBe(50)
    expect(result.unmeasured).toBe(1)
  })

  it('rend `null` quand rien n’est mesurable', () => {
    const result = aggregateMargin([{ dailyRateCents: null, dailyCostCents: null, days: null }])
    expect(result.marginPercent).toBeNull()
    expect(result.measured).toBe(0)
    expect(result.unmeasured).toBe(1)
  })
})
