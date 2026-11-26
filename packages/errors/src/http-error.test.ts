import { describe, expect, it } from 'vitest'
import { HttpError, HttpRetriesExhaustedError, HttpTimeoutError } from './http-error.js'

describe('HttpError', () => {
  it('exposes status, body, retryable, endpoint', () => {
    const err = new HttpError(503, 'boom', true, '/v1/analyze')
    expect(err.status).toBe(503)
    expect(err.body).toBe('boom')
    expect(err.retryable).toBe(true)
    expect(err.endpoint).toBe('/v1/analyze')
  })

  it('name is HttpError (survives minification via readonly literal)', () => {
    const err = new HttpError(500, '', false, '/x')
    expect(err.name).toBe('HttpError')
  })

  it('message includes status, endpoint and body', () => {
    const err = new HttpError(404, 'Not Found', false, '/v1/foo')
    expect(err.message).toBe('HTTP 404 on /v1/foo: Not Found')
  })

  it('carries cause when provided', () => {
    const root = new Error('root')
    const err = new HttpError(500, '', true, '/x', { cause: root })
    expect(err.cause).toBe(root)
  })

  it('is instanceof Error', () => {
    expect(new HttpError(500, '', true, '/x')).toBeInstanceOf(Error)
  })
})

describe('HttpTimeoutError', () => {
  it('exposes timeoutMs and endpoint', () => {
    const err = new HttpTimeoutError(1500, '/v1/slow')
    expect(err.timeoutMs).toBe(1500)
    expect(err.endpoint).toBe('/v1/slow')
    expect(err.name).toBe('HttpTimeoutError')
  })

  it('formats the timeout in the message', () => {
    const err = new HttpTimeoutError(5000, '/v1/slow')
    expect(err.message).toBe('Request timed out after 5000ms on /v1/slow')
  })

  it('carries cause when provided', () => {
    const root = new Error('abort')
    const err = new HttpTimeoutError(1000, '/x', { cause: root })
    expect(err.cause).toBe(root)
  })
})

describe('HttpRetriesExhaustedError', () => {
  it('exposes attempts and endpoint', () => {
    const err = new HttpRetriesExhaustedError(3, '/v1/flaky')
    expect(err.attempts).toBe(3)
    expect(err.endpoint).toBe('/v1/flaky')
    expect(err.name).toBe('HttpRetriesExhaustedError')
  })

  it('message appends the cause message when a cause is given', () => {
    const cause = new Error('upstream down')
    const err = new HttpRetriesExhaustedError(4, '/v1/flaky', { cause })
    expect(err.message).toBe('Request failed after 4 attempts on /v1/flaky: upstream down')
  })

  it('message has no cause suffix when none is provided', () => {
    const err = new HttpRetriesExhaustedError(2, '/v1/flaky')
    expect(err.message).toBe('Request failed after 2 attempts on /v1/flaky')
  })
})
