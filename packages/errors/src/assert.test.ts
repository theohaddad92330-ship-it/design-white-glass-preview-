import { describe, expect, it } from 'vitest'
import { assert } from './assert.js'
import { AssertionError } from './error.js'

describe('assert', () => {
  it('is a no-op on truthy', () => {
    expect(() => assert(true)).not.toThrow()
    expect(() => assert(1)).not.toThrow()
    expect(() => assert('x')).not.toThrow()
    expect(() => assert({})).not.toThrow()
  })

  it('throws AssertionError on falsy', () => {
    expect(() => assert(false)).toThrow(AssertionError)
    expect(() => assert(0)).toThrow(AssertionError)
    expect(() => assert('')).toThrow(AssertionError)
    expect(() => assert(null)).toThrow(AssertionError)
    expect(() => assert(undefined)).toThrow(AssertionError)
  })

  it('uses the default message when none is provided', () => {
    expect(() => assert(false)).toThrow('The assertion failed')
  })

  it('uses the provided message', () => {
    expect(() => assert(false, 'x must be set')).toThrow('x must be set')
  })

  it('narrows the type at compile time', () => {
    const value: string | undefined = 'hello' as string | undefined
    assert(value !== undefined)
    // If the narrowing worked, TS lets us read .length without `!`. Runtime check:
    expect(value.length).toBe(5)
  })
})
