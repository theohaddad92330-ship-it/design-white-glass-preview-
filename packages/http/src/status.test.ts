import { describe, expect, it } from 'vitest'
import { isRetryableStatus } from './status.js'

describe('isRetryableStatus', () => {
  it('returns true for all 5xx', () => {
    expect(isRetryableStatus(500)).toBe(true)
    expect(isRetryableStatus(502)).toBe(true)
    expect(isRetryableStatus(503)).toBe(true)
    expect(isRetryableStatus(504)).toBe(true)
    expect(isRetryableStatus(599)).toBe(true)
  })

  it('returns true for 408 (Request Timeout) and 429 (Too Many Requests)', () => {
    expect(isRetryableStatus(408)).toBe(true)
    expect(isRetryableStatus(429)).toBe(true)
  })

  it('returns false for other 4xx statuses (caller bugs)', () => {
    expect(isRetryableStatus(400)).toBe(false)
    expect(isRetryableStatus(401)).toBe(false)
    expect(isRetryableStatus(403)).toBe(false)
    expect(isRetryableStatus(404)).toBe(false)
    expect(isRetryableStatus(409)).toBe(false)
    expect(isRetryableStatus(422)).toBe(false)
  })

  it('returns false for 2xx and 3xx', () => {
    expect(isRetryableStatus(200)).toBe(false)
    expect(isRetryableStatus(201)).toBe(false)
    expect(isRetryableStatus(204)).toBe(false)
    expect(isRetryableStatus(301)).toBe(false)
    expect(isRetryableStatus(304)).toBe(false)
  })
})
