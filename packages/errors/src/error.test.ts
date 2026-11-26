import { describe, expect, it } from 'vitest'
import {
  AbortedError,
  AssertionError,
  NotYetImplementedError,
  TechnicalError,
  UnreachableCaseError,
  checkDefinedAndNotNull,
} from './error.js'

describe('TechnicalError', () => {
  it('sets name from the class constructor', () => {
    const err = new TechnicalError('boom')
    expect(err.name).toBe('TechnicalError')
    expect(err.message).toBe('boom')
  })

  it('carries cause and context', () => {
    const cause = new Error('root')
    const ctx = { userId: '42' }
    const err = new TechnicalError('boom', { cause, context: ctx })
    expect((err as Error).cause).toBe(cause)
    expect(err.context).toBe(ctx)
  })

  it('has no context by default', () => {
    expect(new TechnicalError('x').context).toBeUndefined()
  })
})

describe('AbortedError / AssertionError', () => {
  it('names reflect their classes', () => {
    expect(new AbortedError('stopped').name).toBe('AbortedError')
    expect(new AssertionError('nope').name).toBe('AssertionError')
  })
})

describe('UnreachableCaseError', () => {
  it('puts the unreachable value into context and sets a generic message', () => {
    const err = new UnreachableCaseError('never-happens' as never)
    expect(err.message).toBe('Unreachable code reached')
    expect(err.context).toBe('never-happens')
    expect(err).toBeInstanceOf(TechnicalError)
  })
})

describe('NotYetImplementedError', () => {
  it('has a fixed message and is a TechnicalError', () => {
    const err = new NotYetImplementedError()
    expect(err.message).toBe('Not yet implemented')
    expect(err).toBeInstanceOf(TechnicalError)
  })
})

describe('checkDefinedAndNotNull', () => {
  it('returns the value when defined', () => {
    expect(checkDefinedAndNotNull('ok')).toBe('ok')
    expect(checkDefinedAndNotNull(0)).toBe(0)
    expect(checkDefinedAndNotNull(false)).toBe(false)
  })

  it('throws TechnicalError on null', () => {
    expect(() => checkDefinedAndNotNull(null)).toThrow(TechnicalError)
  })

  it('throws TechnicalError on undefined', () => {
    expect(() => checkDefinedAndNotNull(undefined)).toThrow(TechnicalError)
  })

  it('attaches provided context on failure', () => {
    try {
      checkDefinedAndNotNull(null, { field: 'email' })
    } catch (err) {
      expect((err as TechnicalError).context).toEqual({ field: 'email' })
      return
    }
    throw new Error('should have thrown')
  })
})
