import { describe, expect, it } from 'vitest'
import { success, failure, isSuccess, isFailure, assertSuccess } from './result.js'

describe('Result', () => {
  it('should create a success', () => {
    const result = success(42)
    expect(result.type).toBe('success')
    expect(result.output).toBe(42)
  })

  it('should create a failure', () => {
    const result = failure('error')
    expect(result.type).toBe('failure')
    expect(result.problem).toBe('error')
  })

  it('should create a void success', () => {
    const result = success()
    expect(result.type).toBe('success')
    expect(result.output).toBeUndefined()
  })

  it('should identify success', () => {
    expect(isSuccess(success(1))).toBe(true)
    expect(isSuccess(failure('err'))).toBe(false)
  })

  it('should identify failure', () => {
    expect(isFailure(failure('err'))).toBe(true)
    expect(isFailure(success(1))).toBe(false)
  })

  it('should assert success and return output', () => {
    expect(assertSuccess(success(42))).toBe(42)
  })

  it('should throw on assertSuccess with failure', () => {
    expect(() => assertSuccess(failure('err'))).toThrow()
  })
})
