import { describe, expect, it } from 'vitest'
import { formatCurrency, formatPercentage, formatPriceCents } from './number.js'

describe('formatCurrency', () => {
  it('should format EUR by default', () => {
    const result = formatCurrency(1234.5)
    expect(result).toContain('1')
    expect(result).toContain('234')
  })
})

describe('formatPercentage', () => {
  it('should format percentage', () => {
    const result = formatPercentage(0.75)
    expect(result).toContain('75')
  })

  it('should normalize values > 1', () => {
    const result = formatPercentage(75)
    expect(result).toContain('75')
  })
})

describe('formatPriceCents', () => {
  it('should convert cents to euros', () => {
    const result = formatPriceCents(1299)
    expect(result).toContain('12')
    expect(result).toContain('99')
  })
})
