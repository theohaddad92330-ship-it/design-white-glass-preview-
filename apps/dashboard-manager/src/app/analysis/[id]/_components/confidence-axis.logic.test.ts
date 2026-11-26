import { describe, expect, it } from 'vitest'
import { confidenceAxisBadge } from './confidence-axis.logic'

// #4595.3 — un axe de confiance absent n'est pas « 0/100 » (et n'est pas rouge STOP) : il est non évalué.
describe('confidenceAxisBadge', () => {
  it('absent / non numérique : « non évalué », sans teinte de verdict', () => {
    for (const raw of [undefined, null, '', 'abc']) {
      expect(confidenceAxisBadge(raw)).toEqual({ text: 'non évalué', tone: null })
    }
  })
  it('un vrai 0 reste 0/100 (STOP)', () => {
    expect(confidenceAxisBadge(0)).toEqual({ text: '0/100', tone: 'STOP' })
  })
  it('seuils inchangés', () => {
    expect(confidenceAxisBadge(40).tone).toBe('PRUDENT')
    expect(confidenceAxisBadge('70').tone).toBe('GO')
  })
})
