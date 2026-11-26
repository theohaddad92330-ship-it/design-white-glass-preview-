import { describe, expect, it } from 'vitest'
import { capitalize, truncate, leftPad, getInitials, getFullName, coerceToString } from './string.js'

describe('capitalize', () => {
  it('should capitalize the first letter', () => {
    expect(capitalize('hello')).toBe('Hello')
  })

  it('should return empty string for empty input', () => {
    expect(capitalize('')).toBe('')
  })
})

describe('truncate', () => {
  it('should not truncate short text', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('should truncate at word boundary', () => {
    const result = truncate('hello world foo', 12)
    expect(result).toBe('hello world…')
  })

  it('should default to 140 chars', () => {
    const short = 'a'.repeat(100)
    expect(truncate(short)).toBe(short)
  })
})

describe('leftPad', () => {
  it('should pad with zeros', () => {
    expect(leftPad(5, 3)).toBe('005')
  })

  it('should not pad if already long enough', () => {
    expect(leftPad(123, 2)).toBe('123')
  })
})

describe('getInitials', () => {
  it('should extract initials', () => {
    expect(getInitials('Jean Dupont')).toBe('JD')
  })

  it('should return ? for empty input', () => {
    expect(getInitials('')).toBe('?')
  })
})

describe('getFullName', () => {
  it('should combine first and last name', () => {
    expect(getFullName('Jean', 'Dupont')).toBe('Jean Dupont')
  })

  it('should handle empty last name', () => {
    expect(getFullName('Jean', '')).toBe('Jean')
  })

  it('should handle empty first name', () => {
    expect(getFullName('', 'Dupont')).toBe('Dupont')
  })
})

describe('coerceToString', () => {
  it('returns the same string', () => {
    expect(coerceToString('hello')).toBe('hello')
  })

  it('stringifies a number', () => {
    expect(coerceToString(150_000)).toBe('150000')
  })

  it('stringifies a boolean', () => {
    expect(coerceToString(true)).toBe('true')
  })

  it('returns null for nullish or empty values', () => {
    expect(coerceToString(null)).toBeNull()
    expect(coerceToString(undefined)).toBeNull()
    expect(coerceToString('')).toBeNull()
  })
})
