import { describe, expect, it } from 'vitest'
import { computeSparkBars } from './Sparkline.logic'

describe('computeSparkBars — #1642', () => {
  it('LIT quelque chose — une série connue produit des hauteurs proportionnelles au max', () => {
    const bars = computeSparkBars([{ value: 5 }, { value: 10 }, { value: 2.5 }])
    expect(bars).toEqual([
      { heightPct: 50, missing: false },
      { heightPct: 100, missing: false },
      { heightPct: 25, missing: false },
    ])
  })

  it('un point manquant est un TROU — distinct d’un vrai zéro (le cas de test n°1)', () => {
    const bars = computeSparkBars([{ value: 10 }, { value: null }, { value: 0 }])
    expect(bars[1]).toEqual({ heightPct: 0, missing: true })
    expect(bars[2]).toEqual({ heightPct: 0, missing: false }) // un vrai 0 mesuré : PAS manquant
  })

  it('sait dire NON — une série entièrement manquante ne produit ni NaN ni crash', () => {
    const bars = computeSparkBars([{ value: null }, { value: null }])
    expect(bars.every(b => b.missing)).toBe(true)
    expect(bars.some(b => Number.isNaN(b.heightPct))).toBe(false)
  })

  it('le max ignore les points manquants — il ne se laisse pas fausser par un trou', () => {
    const bars = computeSparkBars([{ value: null }, { value: 4 }, { value: 8 }])
    expect(bars[2]?.heightPct).toBe(100)
  })

  it('n’attrape pas ce qu’elle ne vise pas — une série vide ne rend rien', () => {
    expect(computeSparkBars([])).toEqual([])
  })
})
