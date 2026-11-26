import { bullConnectionOptions, parseRedisUrl } from './redis-connection'

describe('parseRedisUrl', () => {
  const original = process.env['REDIS_URL']

  afterEach(() => {
    if (original === undefined) {
      delete process.env['REDIS_URL']
    } else {
      process.env['REDIS_URL'] = original
    }
  })

  it('parses host and port from a plain URL', () => {
    process.env['REDIS_URL'] = 'redis://example.com:6400'
    expect(parseRedisUrl()).toEqual({ host: 'example.com', port: 6400, password: undefined })
  })

  it('preserves password from a Railway-style URL', () => {
    process.env['REDIS_URL'] = 'redis://:secret@redis.railway.internal:6379'
    expect(parseRedisUrl()).toEqual({
      host: 'redis.railway.internal',
      port: 6379,
      password: 'secret',
    })
  })

  it('defaults port to 6379 when omitted', () => {
    process.env['REDIS_URL'] = 'redis://host-only'
    expect(parseRedisUrl().port).toBe(6379)
  })

  it('falls back to localhost:6379 when REDIS_URL is empty', () => {
    delete process.env['REDIS_URL']
    expect(parseRedisUrl()).toEqual({ host: 'localhost', port: 6379 })
  })

  it('falls back when REDIS_URL is malformed', () => {
    process.env['REDIS_URL'] = 'not a url'
    expect(parseRedisUrl()).toEqual({ host: 'localhost', port: 6379 })
  })
})

describe('bullConnectionOptions', () => {
  const original = process.env['REDIS_URL']

  afterEach(() => {
    if (original === undefined) {
      delete process.env['REDIS_URL']
    } else {
      process.env['REDIS_URL'] = original
    }
  })

  it('carries the parsed host/port/password from REDIS_URL', () => {
    process.env['REDIS_URL'] = 'redis://:secret@redis.railway.internal:6400'
    const opts = bullConnectionOptions()
    expect(opts.host).toBe('redis.railway.internal')
    expect(opts.port).toBe(6400)
    expect(opts.password).toBe('secret')
  })

  it('pins maxRetriesPerRequest to null (BullMQ requires it on the blocking client)', () => {
    expect(bullConnectionOptions().maxRetriesPerRequest).toBeNull()
  })

  it('keeps the ready-check on', () => {
    expect(bullConnectionOptions().enableReadyCheck).toBe(true)
  })

  it('reconnects FOREVER with bounded backoff — never gives up (never returns null)', () => {
    const { retryStrategy } = bullConnectionOptions()
    expect(retryStrategy(1)).toBe(200)
    expect(retryStrategy(5)).toBe(1_000)
    // Capped so a long outage doesn't stretch the reconnect interval unboundedly…
    expect(retryStrategy(100)).toBe(3_000)
    // …but it ALWAYS returns a finite delay, so ioredis keeps retrying.
    expect(retryStrategy(10_000)).toBe(3_000)
  })
})
