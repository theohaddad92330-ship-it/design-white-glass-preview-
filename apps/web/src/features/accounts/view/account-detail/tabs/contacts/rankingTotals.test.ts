import type { RankedContact } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { rankingTotals } from './rankingTotals'

const axes = (rows: Array<[string, number | null, number]>): RankedContact['axes'] =>
  rows.map(([key, points, max]) => ({ key, points, max, reason: 'r' }) as unknown as RankedContact['axes'][number])

const never = () => false

describe('rankingTotals — Recette 21/10 A.2 : détail et total ne divergent jamais', () => {
  it('le total sur 100 est la somme que le détail additionne, ramenée sur ses maxima', () => {
    // Cas vu en recette : 53 points sur 85 de maxima.
    const rows = axes([
      ['a', 20, 30],
      ['b', 15, 15],
      ['c', 10, 20],
      ['d', 8, 20],
      ['e', null, 10],
    ])
    expect(rankingTotals(rows, never)).toEqual({ points: 53, max: 85, score100: 62 })
  })

  it('sait dire NON : un critère de départage et un axe non évalué n’entrent pas', () => {
    const rows = axes([
      ['a', 10, 20],
      ['reach', 5, 5],
      ['c', null, 20],
    ])
    expect(rankingTotals(rows, key => key === 'reach')).toEqual({ points: 10, max: 20, score100: 50 })
  })

  it('aucun critère évalué : null, jamais 0', () => {
    expect(rankingTotals(axes([['a', null, 10]]), never)).toBeNull()
  })
})
