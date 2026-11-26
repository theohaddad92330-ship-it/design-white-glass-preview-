import { describe, expect, it } from 'vitest'
import { sanitizeDebugIdentifier } from './sanitize-debug-identifier'

describe('sanitizeDebugIdentifier (#2445.15)', () => {
  it('masks the local part of an email, keeps the domain', () => {
    expect(sanitizeDebugIdentifier('louis@growth-wave.agency')).toBe('l***@growth-wave.agency')
  })

  it('masks a single-character local part', () => {
    expect(sanitizeDebugIdentifier('a@example.com')).toBe('***@example.com')
  })

  it('returns "anonymous" when there is no identifier', () => {
    expect(sanitizeDebugIdentifier(undefined)).toBe('anonymous')
    expect(sanitizeDebugIdentifier(null)).toBe('anonymous')
    expect(sanitizeDebugIdentifier('')).toBe('anonymous')
  })

  it('masks a value with no @ instead of showing it raw', () => {
    expect(sanitizeDebugIdentifier('not-an-email')).toBe('***')
  })
})
