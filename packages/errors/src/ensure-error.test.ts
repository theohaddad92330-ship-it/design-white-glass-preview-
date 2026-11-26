import { describe, expect, it } from 'vitest'
import { ensureError, thrownValuesObservable } from './ensure-error.js'

describe('ensureError', () => {
  it('returns Error instances as-is', () => {
    const err = new Error('already an error')
    expect(ensureError(err)).toBe(err)
  })

  it('returns subclass instances as-is', () => {
    class CustomError extends Error {}
    const err = new CustomError('sub')
    expect(ensureError(err)).toBe(err)
  })

  it('wraps a thrown string into an Error with JSON-stringified payload', () => {
    const result = ensureError('boom')
    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('This value was thrown as is, not through an Error: "boom"')
  })

  it('wraps a thrown plain object', () => {
    const result = ensureError({ code: 42 })
    expect(result.message).toBe('This value was thrown as is, not through an Error: {"code":42}')
  })

  it('wraps a thrown number', () => {
    const result = ensureError(42)
    expect(result.message).toBe('This value was thrown as is, not through an Error: 42')
  })

  it('handles values that cannot be JSON.stringified (e.g. circular refs)', () => {
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    const result = ensureError(circular)
    expect(result).toBeInstanceOf(Error)
    expect(result.message).toContain('[Unable to stringify the thrown value]')
  })

  it('broadcasts non-Error throws to thrownValuesObservable', () => {
    const seen: unknown[] = []
    const unsubscribe = thrownValuesObservable.subscribe(v => seen.push(v))
    try {
      ensureError('str-throw')
      const last = seen[seen.length - 1] as { value: unknown; stringified: string }
      expect(last.value).toBe('str-throw')
      expect(last.stringified).toBe('"str-throw"')
    } finally {
      unsubscribe()
    }
  })

  it('does not broadcast when the value is already an Error', () => {
    const seen: unknown[] = []
    const unsubscribe = thrownValuesObservable.subscribe(v => seen.push(v))
    try {
      const before = seen.length
      ensureError(new Error('native'))
      expect(seen.length).toBe(before)
    } finally {
      unsubscribe()
    }
  })
})
