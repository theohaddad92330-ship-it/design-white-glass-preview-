import type { DataSource } from 'typeorm'
import { ANALYSIS_WORKER_NAME, WorkerReadinessRegistry } from '../worker-readiness/worker-readiness.registry'
import { ReadinessService } from './readiness.service'

/**
 * Test double: the Redis probe is a real network call in prod, so it's swapped
 * for a deterministic up / down / hung behaviour. `checkTimeoutMs` is shrunk so
 * the timeout test runs in ~100ms instead of 2s.
 */
class TestReadinessService extends ReadinessService {
  protected override readonly checkTimeoutMs: number = 100
  redisProbe: () => Promise<void> = async () => {}
  postgresProbe: () => Promise<void> = async () => {}

  constructor(registry: WorkerReadinessRegistry) {
    // A placeholder DataSource: `probePostgres` is overridden below.
    super(registry, {} as DataSource)
  }

  protected override probeRedis(): Promise<void> {
    return this.redisProbe()
  }

  protected override probePostgres(): Promise<void> {
    return this.postgresProbe()
  }
}

function registryWithWorker(live: boolean): WorkerReadinessRegistry {
  const registry = new WorkerReadinessRegistry()
  registry.register(ANALYSIS_WORKER_NAME, () => live)
  return registry
}

describe('ReadinessService', () => {
  it('is ready when Redis answers AND the analysis worker is live', async () => {
    const service = new TestReadinessService(registryWithWorker(true))
    const report = await service.check()

    expect(report.ready).toBe(true)
    expect(report.redis).toBe(true)
    expect(report.worker).toBe(true)
    expect(report.workers).toEqual({ [ANALYSIS_WORKER_NAME]: true })
    expect(new Date(report.checkedAt).toISOString()).toBe(report.checkedAt)
  })

  it('is NOT ready when Redis is unreachable (deploy must not be promoted)', async () => {
    const service = new TestReadinessService(registryWithWorker(true))
    service.redisProbe = () => Promise.reject(new Error('ECONNREFUSED'))

    const report = await service.check()

    expect(report.ready).toBe(false)
    expect(report.redis).toBe(false)
    expect(report.worker).toBe(true)
  })

  it('is NOT ready when the worker never registered (boot incomplete)', async () => {
    const service = new TestReadinessService(new WorkerReadinessRegistry())
    const report = await service.check()

    expect(report.ready).toBe(false)
    expect(report.worker).toBe(false)
    expect(report.redis).toBe(true)
  })

  it('is NOT ready when the analysis worker stopped running', async () => {
    const service = new TestReadinessService(registryWithWorker(false))
    const report = await service.check()

    expect(report.ready).toBe(false)
    expect(report.worker).toBe(false)
  })

  it('treats a hung Redis probe as down after the bounded timeout', async () => {
    const service = new TestReadinessService(registryWithWorker(true))
    service.redisProbe = () => new Promise<never>(() => {}) // never settles

    const startedAt = Date.now()
    const report = await service.check()

    expect(report.ready).toBe(false)
    expect(report.redis).toBe(false)
    // The 100ms test budget bounded the hang — well under the real 2s.
    expect(Date.now() - startedAt).toBeLessThan(1_000)
  })

  // INC-04-10 — `/health/ready` disait `ready` pendant 50 min de pool bloqué :
  // il ne sondait pas Postgres. La sonde est bornée, et RAPPORTÉE sans gater
  // `ready` (le healthcheck de déploiement Railway vise ce chemin : un simple
  // ralentissement de la base ne doit pas faire échouer un déploiement — c'est
  // le chien de garde du pool qui relance un process bloqué).
  it('reports postgres:true when SELECT 1 answers', async () => {
    const service = new TestReadinessService(registryWithWorker(true))
    const report = await service.check()

    expect(report.postgres).toBe(true)
    expect(report.ready).toBe(true)
  })

  it('reports postgres:false on a failing probe, without un-readying the deploy gate', async () => {
    const service = new TestReadinessService(registryWithWorker(true))
    service.postgresProbe = () => Promise.reject(new Error('timeout exceeded when trying to connect'))

    const report = await service.check()

    expect(report.postgres).toBe(false)
    expect(report.ready).toBe(true)
  })

  it('treats a hung postgres probe as down after the bounded timeout', async () => {
    const service = new TestReadinessService(registryWithWorker(true))
    service.postgresProbe = () => new Promise<never>(() => {})

    const startedAt = Date.now()
    const report = await service.check()

    expect(report.postgres).toBe(false)
    expect(Date.now() - startedAt).toBeLessThan(1_000)
  })

  it('reports postgres:null when no DataSource is wired (nothing measured ≠ down)', async () => {
    const service = new ReadinessService(registryWithWorker(true))
    // Redis réel indisponible en test : seul `postgres` nous intéresse ici.
    jest.spyOn(service as unknown as { probeRedis: () => Promise<void> }, 'probeRedis').mockResolvedValue()
    const report = await service.check()

    expect(report.postgres).toBeNull()
  })
})
