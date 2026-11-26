import { describe, expect, it } from 'vitest'
import { computeSegments } from './SegmentBar.logic'

describe('computeSegments — #1642', () => {
  it('LIT quelque chose — les parts se répartissent proportionnellement et somment à 100', () => {
    const { slices, total } = computeSegments([
      { label: 'A', value: 30 },
      { label: 'B', value: 70 },
    ])
    expect(total).toBe(100)
    expect(slices.map(s => s.pct)).toEqual([30, 70])
  })

  it('sait dire NON — un total nul rend total: null, pas une barre à 0 partout qui prétend une mesure', () => {
    const { slices, total } = computeSegments([
      { label: 'A', value: 0 },
      { label: 'B', value: 0 },
    ])
    expect(total).toBeNull()
    expect(slices.every(s => s.pct === 0)).toBe(true)
  })

  it('aucun segment ne rend rien, sans crash', () => {
    expect(computeSegments([])).toEqual({ slices: [], total: null })
  })

  it('une valeur négative ou non finie ne contribue pas au total ni à sa propre part', () => {
    const { slices, total } = computeSegments([
      { label: 'A', value: 40 },
      { label: 'B', value: -5 },
      { label: 'C', value: Number.NaN },
    ])
    expect(total).toBe(40)
    expect(slices.find(s => s.label === 'B')?.pct).toBe(0)
    expect(slices.find(s => s.label === 'C')?.pct).toBe(0)
    expect(slices.find(s => s.label === 'A')?.pct).toBe(100)
  })

  it('n’attrape pas ce qu’elle ne vise pas — préserve le label et la couleur fournis', () => {
    const { slices } = computeSegments([{ label: 'A', value: 5, color: 'var(--green)' }])
    expect(slices[0]).toMatchObject({ label: 'A', color: 'var(--green)' })
  })
})
