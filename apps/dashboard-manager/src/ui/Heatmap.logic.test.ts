import { describe, expect, it } from 'vitest'
import { computeIntensity, intensityDomain } from './Heatmap.logic'

describe('intensityDomain', () => {
  it('LIT quelque chose — le domaine ignore les cellules non mesurées', () => {
    expect(intensityDomain([null, 3, undefined, 9])).toEqual({ min: 3, max: 9 })
  })

  it('sait dire NON — aucune valeur connue rend null, pas 0..0', () => {
    expect(intensityDomain([null, undefined])).toBeNull()
    expect(intensityDomain([])).toBeNull()
  })
})

describe('computeIntensity — 5 paliers', () => {
  it('borne min → palier 0, borne max → palier 4 (jamais 5)', () => {
    expect(computeIntensity(0, 0, 10)).toBe(0)
    expect(computeIntensity(10, 0, 10)).toBe(4)
  })

  it('répartit les paliers intermédiaires', () => {
    expect(computeIntensity(2, 0, 10)).toBe(1) // 20% → palier 1
    expect(computeIntensity(5, 0, 10)).toBe(2) // 50% → palier 2
    expect(computeIntensity(8, 0, 10)).toBe(4) // 80% → palier 4
  })

  it('une cellule non mesurée reste null — distincte du palier 0', () => {
    expect(computeIntensity(null, 0, 10)).toBeNull()
    expect(computeIntensity(undefined, 0, 10)).toBeNull()
  })

  it('sait dire NON — un domaine plat (min === max) ne divise pas par zéro', () => {
    expect(computeIntensity(7, 7, 7)).toBe(0)
  })

  it('n’attrape pas ce qu’elle ne vise pas — une valeur hors domaine se borne au palier limite', () => {
    expect(computeIntensity(-5, 0, 10)).toBe(0)
    expect(computeIntensity(50, 0, 10)).toBe(4)
  })
})
