import { describe, expect, it } from 'vitest'

import { countOrUnmeasured, NON_MESURE, pctOrUnmeasured, secondsOrDash, tokensOrDash } from './mesure'

describe('mesure — une valeur absente ne s’affiche jamais 0 (supervision 30/09)', () => {
  it('pct : null / undefined / NaN => non mesuré, 0 mesuré => 0,0 %', () => {
    expect(pctOrUnmeasured(null)).toBe(NON_MESURE)
    expect(pctOrUnmeasured(undefined)).toBe(NON_MESURE)
    expect(pctOrUnmeasured(Number.NaN)).toBe(NON_MESURE)
    expect(pctOrUnmeasured(0)).toBe('0.0 %')
    expect(pctOrUnmeasured(0.2)).toBe('20.0 %')
  })

  it('count : null => non mesuré, 0 mesuré => 0', () => {
    expect(countOrUnmeasured(null)).toBe(NON_MESURE)
    expect(countOrUnmeasured(0)).toBe('0')
    expect(countOrUnmeasured(4)).toBe('4')
  })

  it('secondes / tokens : null => —, 0 mesuré => 0', () => {
    expect(secondsOrDash(null)).toBe('—')
    expect(secondsOrDash(undefined)).toBe('—')
    expect(secondsOrDash(0)).toBe('0s')
    expect(secondsOrDash(12_400)).toBe('12s')
    expect(tokensOrDash(null)).toBe('—')
    expect(tokensOrDash(0)).toBe('0')
  })
})
