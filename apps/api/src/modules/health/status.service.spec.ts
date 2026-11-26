import type { ConfigService } from '@nestjs/config'
import type { DataSource } from 'typeorm'
import { StatusService } from './status.service'

/**
 * Test double: the DB probe stays on the (fake) DataSource, while the Redis and
 * IA probes — real network calls in prod — are swapped for deterministic
 * behaviours. `checkTimeoutMs` is shrunk so the timeout test runs in ~100ms.
 */
class TestStatusService extends StatusService {
  protected override readonly checkTimeoutMs: number = 100
  redisProbe: () => Promise<void> = async () => {}
  iaProbe: () => Promise<void> = async () => {}

  protected override probeRedis(): Promise<void> {
    return this.redisProbe()
  }

  protected override probeIaEngine(): Promise<void> {
    return this.iaProbe()
  }
}

/** Same double without the 15s cache — every getStatus() re-probes. */
class NoCacheStatusService extends TestStatusService {
  protected override readonly cacheTtlMs: number = 0
}

function fakeDataSource(query: jest.Mock = jest.fn().mockResolvedValue([{ ok: 1 }])): DataSource {
  return { query } as unknown as DataSource
}

function fakeConfig(): ConfigService {
  return { get: (_key: string, def?: string) => def } as unknown as ConfigService
}

describe('StatusService', () => {
  const OLD_ENV = process.env

  afterEach(() => {
    process.env = OLD_ENV
  })

  it('reports operational when every component responds', async () => {
    const service = new TestStatusService(fakeDataSource(), fakeConfig())
    const report = await service.getStatus()

    expect(report.status).toBe('operational')
    expect(report.components.database.status).toBe('operational')
    expect(report.components.redis.status).toBe('operational')
    expect(report.components.ia_engine.status).toBe('operational')
    expect(report.components.api.status).toBe('operational')
    expect(report.components.api.uptimeSeconds).toBeGreaterThanOrEqual(0)
    expect(new Date(report.checkedAt).toISOString()).toBe(report.checkedAt)
  })

  it('reports degraded when the IA engine is down (non-critical)', async () => {
    const service = new TestStatusService(fakeDataSource(), fakeConfig())
    service.iaProbe = () => Promise.reject(new Error('ECONNREFUSED'))

    const report = await service.getStatus()

    expect(report.status).toBe('degraded')
    expect(report.components.ia_engine).toEqual({ status: 'down', latencyMs: null })
    expect(report.components.database.status).toBe('operational')
  })

  it('reports degraded when Redis is down (non-critical)', async () => {
    const service = new TestStatusService(fakeDataSource(), fakeConfig())
    service.redisProbe = () => Promise.reject(new Error('connection refused'))

    const report = await service.getStatus()

    expect(report.status).toBe('degraded')
    expect(report.components.redis.status).toBe('down')
  })

  it('reports down when the database is down (critical), even with everything else up', async () => {
    const service = new TestStatusService(fakeDataSource(jest.fn().mockRejectedValue(new Error('boom'))), fakeConfig())

    const report = await service.getStatus()

    expect(report.status).toBe('down')
    expect(report.components.database.status).toBe('down')
    expect(report.components.redis.status).toBe('operational')
  })

  it('treats a hung probe as down after the per-check timeout', async () => {
    const service = new TestStatusService(fakeDataSource(), fakeConfig())
    service.redisProbe = () => new Promise<never>(() => {}) // never settles

    const startedAt = Date.now()
    const report = await service.getStatus()

    expect(report.status).toBe('degraded')
    expect(report.components.redis.status).toBe('down')
    // The 100ms test timeout bounded the hang — well under the real 2s budget.
    expect(Date.now() - startedAt).toBeLessThan(1_500)
  })

  it('serves from the in-memory cache within the TTL (single probe run)', async () => {
    const query = jest.fn().mockResolvedValue([{ ok: 1 }])
    const service = new TestStatusService(fakeDataSource(query), fakeConfig())

    const first = await service.getStatus()
    const second = await service.getStatus()

    expect(query).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })

  it('re-probes once the cache TTL has expired', async () => {
    const query = jest.fn().mockResolvedValue([{ ok: 1 }])
    const service = new NoCacheStatusService(fakeDataSource(query), fakeConfig())

    await service.getStatus()
    await service.getStatus()

    expect(query).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent callers onto one in-flight check', async () => {
    const query = jest.fn().mockResolvedValue([{ ok: 1 }])
    const service = new NoCacheStatusService(fakeDataSource(query), fakeConfig())

    await Promise.all([service.getStatus(), service.getStatus(), service.getStatus()])

    expect(query).toHaveBeenCalledTimes(1)
  })

  it('exposes exactly the public contract — no extra keys, no internals', async () => {
    const service = new TestStatusService(fakeDataSource(), fakeConfig())
    service.iaProbe = () => Promise.reject(new Error('secret-internal-url http://10.0.0.1:8000'))

    const report = await service.getStatus()

    expect(Object.keys(report).sort()).toEqual(['checkedAt', 'components', 'status'])
    expect(Object.keys(report.components).sort()).toEqual(['api', 'database', 'ia_engine', 'redis'])
    expect(Object.keys(report.components.ia_engine).sort()).toEqual(['latencyMs', 'status'])
    // The failure reason (which may contain internal URLs) never reaches the payload.
    expect(JSON.stringify(report)).not.toContain('10.0.0.1')
  })

  describe('api component build identity', () => {
    it('exposes a short (7-char) commit from SENTRY_RELEASE', async () => {
      process.env = { ...OLD_ENV, SENTRY_RELEASE: 'abcdef1234567890' }
      const service = new TestStatusService(fakeDataSource(), fakeConfig())

      const report = await service.getStatus()

      expect(report.components.api.commit).toBe('abcdef1')
    })

    it('falls back to "unknown" without release env vars', async () => {
      process.env = {
        ...OLD_ENV,
        SENTRY_RELEASE: undefined,
        RAILWAY_GIT_COMMIT_SHA: undefined,
        GIT_COMMIT: undefined,
      } as NodeJS.ProcessEnv
      const service = new TestStatusService(fakeDataSource(), fakeConfig())

      const report = await service.getStatus()

      expect(report.components.api.commit).toBe('unknown')
    })
  })
})
