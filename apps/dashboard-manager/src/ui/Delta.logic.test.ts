import { describe, expect, it } from 'vitest'
import { computeDelta } from './Delta.logic'

describe('computeDelta — #1642', () => {
  it('sait dire NON — une valeur absente n’est jamais 0', () => {
    expect(computeDelta(null)).toEqual({ tone: 'unknown', formatted: 'non mesuré', arrow: null })
    expect(computeDelta(undefined)).toEqual({ tone: 'unknown', formatted: 'non mesuré', arrow: null })
    expect(computeDelta(Number.NaN)).toEqual({ tone: 'unknown', formatted: 'non mesuré', arrow: null })
    expect(computeDelta(Number.POSITIVE_INFINITY).tone).toBe('unknown')
  })

  it('une vraie stagnation à 0 reste distincte d’une valeur non mesurée', () => {
    expect(computeDelta(0)).toEqual({ tone: 'flat', formatted: '0 %', arrow: '→' })
  })

  it('positif — ton up, flèche haut, signe +, virgule française', () => {
    expect(computeDelta(8.2)).toEqual({ tone: 'up', formatted: '+8,2 %', arrow: '↑' })
  })

  it('négatif — ton down, flèche bas, signe −', () => {
    expect(computeDelta(-4.3)).toEqual({ tone: 'down', formatted: '−4,3 %', arrow: '↓' })
  })

  it('la flèche accompagne TOUJOURS un ton connu — jamais la couleur seule', () => {
    for (const v of [8.2, -4.3, 0]) {
      expect(computeDelta(v).arrow).not.toBeNull()
    }
  })

  it('arrondit à la décimale demandée', () => {
    expect(computeDelta(8.249, 1).formatted).toBe('+8,2 %')
    expect(computeDelta(8.25, 0).formatted).toBe('+8 %')
  })

  it('n’attrape pas ce qu’elle ne vise pas — une petite valeur positive/négative reste up/down, pas flat', () => {
    expect(computeDelta(0.01).tone).toBe('up')
    expect(computeDelta(-0.01).tone).toBe('down')
  })
})
