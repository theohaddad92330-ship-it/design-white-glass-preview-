import type { Response } from 'express'
import { HealthController } from './health.controller'
import type { ReadinessReport, ReadinessService } from './readiness.service'

function fakeReadiness(report: ReadinessReport): ReadinessService {
  return { check: jest.fn().mockResolvedValue(report) } as unknown as ReadinessService
}

/** Minimal express `Response` double that records the status set by the handler. */
function fakeRes(): Response & { statusCode: number } {
  const res = {
    statusCode: 0,
    status(code: number) {
      this.statusCode = code
      return this
    },
  }
  return res as unknown as Response & { statusCode: number }
}

const READY: ReadinessReport = {
  ready: true,
  redis: true,
  postgres: true,
  worker: true,
  workers: { analysis: true },
  checkedAt: new Date().toISOString(),
}

describe('HealthController', () => {
  const controller = new HealthController(fakeReadiness(READY))

  it('health returns ok + a timestamp', () => {
    const res = controller.health()
    expect(res.status).toBe('ok')
    expect(typeof res.timestamp).toBe('string')
  })

  describe('ready (deploy gate)', () => {
    it('responds 200 + status "ready" when Redis and the worker are up', async () => {
      const ctrl = new HealthController(fakeReadiness(READY))
      const res = fakeRes()

      const body = await ctrl.ready(res)

      expect(res.statusCode).toBe(200)
      expect(body.status).toBe('ready')
      expect(body.ready).toBe(true)
    })

    it('responds 503 + status "not_ready" when a gating condition is down', async () => {
      const ctrl = new HealthController(fakeReadiness({ ...READY, ready: false, redis: false }))
      const res = fakeRes()

      const body = await ctrl.ready(res)

      expect(res.statusCode).toBe(503)
      expect(body.status).toBe('not_ready')
      expect(body.ready).toBe(false)
    })
  })

  describe('version (Théo P0 — parité release)', () => {
    const OLD = process.env

    afterEach(() => {
      process.env = OLD
    })

    it('reports the commit from SENTRY_RELEASE + the environment', async () => {
      process.env = { ...OLD, SENTRY_RELEASE: 'abc123def4', SENTRY_ENVIRONMENT: 'prod' }
      const res = await controller.version()
      expect(res.commit).toBe('abc123def4')
      expect(res.environment).toBe('prod')
      expect(typeof res.timestamp).toBe('string')
    })

    it('falls back to RAILWAY_GIT_COMMIT_SHA then "unknown"', async () => {
      process.env = { ...OLD, SENTRY_RELEASE: undefined, RAILWAY_GIT_COMMIT_SHA: 'railwaysha1' } as NodeJS.ProcessEnv
      expect((await controller.version()).commit).toBe('railwaysha1')

      process.env = {
        ...OLD,
        SENTRY_RELEASE: undefined,
        RAILWAY_GIT_COMMIT_SHA: undefined,
        GIT_COMMIT: undefined,
      } as NodeJS.ProcessEnv
      expect((await controller.version()).commit).toBe('unknown')
    })

    it('#4711.1 — built_at (la construction) est un champ distinct de timestamp (la réponse), null si inconnu', async () => {
      process.env = { ...OLD, BUILD_TIME: '2026-11-01T08:00:00Z' } as NodeJS.ProcessEnv
      const res = await controller.version()
      expect(res.built_at).toBe('2026-11-01T08:00:00Z')
      expect(res.built_at).not.toBe(res.timestamp)
      process.env = { ...OLD, BUILD_TIME: undefined } as NodeJS.ProcessEnv
      expect((await controller.version()).built_at).toBeNull()
    })

    it('rend la révision du service IA, et `null` quand il ne répond pas', async () => {
      // L'IA est un déploiement distinct : c'est CE champ qui distingue « correctif
      // déployé et insuffisant » de « pas encore redéployé ».
      const withIa = new HealthController(
        { check: jest.fn() } as never,
        {
          version: jest.fn().mockResolvedValue({ commit: 'ia-sha', environment: 'prod' }),
        } as never,
      )
      expect((await withIa.version()).ia).toEqual({ commit: 'ia-sha', environment: 'prod' })

      const silentIa = new HealthController(
        { check: jest.fn() } as never,
        {
          version: jest.fn().mockResolvedValue(null),
        } as never,
      )
      expect((await silentIa.version()).ia).toBeNull()

      // Sans client injecté (spec à constructeur nu) : `null`, jamais une erreur.
      expect((await controller.version()).ia).toBeNull()
    })
  })
})
