import { describe, expect, it } from 'vitest'
import { barShare, isBelowTaceThreshold, parseThresholdDraft } from './staffing-view'

const value = (percent: number | null) => ({ percent, days: percent, availableDays: 20 })

describe('isBelowTaceThreshold', () => {
  it('never alerts while the ESN has not set a threshold', () => {
    expect(isBelowTaceThreshold(value(10), null)).toBe(false)
  })
  it('never alerts on a value that was not measured — absence is not 0 %', () => {
    expect(isBelowTaceThreshold(value(null), 80)).toBe(false)
  })
  it('alerts strictly below the threshold the ESN typed', () => {
    expect(isBelowTaceThreshold(value(79.9), 80)).toBe(true)
    expect(isBelowTaceThreshold(value(80), 80)).toBe(false)
  })
})

describe('barShare', () => {
  it('is 0 for an empty series and caps at 100', () => {
    expect(barShare(5, 0)).toBe(0)
    expect(barShare(0, 10)).toBe(0)
    expect(barShare(5, 10)).toBe(50)
    expect(barShare(12, 10)).toBe(100)
  })
})

describe('parseThresholdDraft', () => {
  it('reads an empty field as "off", not as 0', () => {
    expect(parseThresholdDraft('  ')).toEqual({ value: null, invalid: false })
  })
  it('accepts a decimal comma and refuses values outside 1-100', () => {
    expect(parseThresholdDraft('82,5')).toEqual({ value: 82.5, invalid: false })
    expect(parseThresholdDraft('0')).toEqual({ value: null, invalid: true })
    expect(parseThresholdDraft('101').invalid).toBe(true)
    expect(parseThresholdDraft('abc').invalid).toBe(true)
  })
})
