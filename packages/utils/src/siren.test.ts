import { describe, expect, it } from 'vitest'
import { parseSirenValue, formatSirenValue } from './siren.js'

describe('parseSirenValue', () => {
  it('should parse a valid 9-digit SIREN', () => {
    expect(parseSirenValue('123456789')).toBe('123456789')
  })

  it('should strip spaces', () => {
    expect(parseSirenValue('123 456 789')).toBe('123456789')
  })

  it('should return null for invalid SIREN', () => {
    expect(parseSirenValue('12345')).toBeNull()
    expect(parseSirenValue('abcdefghi')).toBeNull()
    expect(parseSirenValue('')).toBeNull()
  })
})

describe('formatSirenValue', () => {
  it('should format with non-breaking spaces', () => {
    expect(formatSirenValue('123456789')).toBe('123\u00A0456\u00A0789')
  })
})
