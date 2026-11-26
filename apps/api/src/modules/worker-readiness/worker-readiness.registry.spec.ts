import { ANALYSIS_WORKER_NAME, WorkerReadinessRegistry } from './worker-readiness.registry'

describe('WorkerReadinessRegistry', () => {
  let registry: WorkerReadinessRegistry

  beforeEach(() => {
    registry = new WorkerReadinessRegistry()
  })

  it('reports a worker live when its registered probe returns true', () => {
    registry.register(ANALYSIS_WORKER_NAME, () => true)
    expect(registry.isLive(ANALYSIS_WORKER_NAME)).toBe(true)
  })

  it('reports a worker not-live when its probe returns false (e.g. worker stopped)', () => {
    registry.register(ANALYSIS_WORKER_NAME, () => false)
    expect(registry.isLive(ANALYSIS_WORKER_NAME)).toBe(false)
  })

  it('fails closed for a name that was never registered', () => {
    expect(registry.isLive('never-registered')).toBe(false)
  })

  it('fails closed (never throws) when a probe itself throws', () => {
    registry.register(ANALYSIS_WORKER_NAME, () => {
      throw new Error('worker getter exploded')
    })
    expect(registry.isLive(ANALYSIS_WORKER_NAME)).toBe(false)
  })

  it('evaluates the probe lazily so a worker registered before it exists still flips live', () => {
    let running = false
    registry.register(ANALYSIS_WORKER_NAME, () => running)
    expect(registry.isLive(ANALYSIS_WORKER_NAME)).toBe(false)
    running = true // the underlying BullMQ Worker finished booting
    expect(registry.isLive(ANALYSIS_WORKER_NAME)).toBe(true)
  })

  it('re-registering replaces the previous probe', () => {
    registry.register(ANALYSIS_WORKER_NAME, () => true)
    registry.register(ANALYSIS_WORKER_NAME, () => false)
    expect(registry.isLive(ANALYSIS_WORKER_NAME)).toBe(false)
  })

  it('snapshot reports each registered worker, coercing a throwing probe to false', () => {
    registry.register('analysis', () => true)
    registry.register('mailer', () => {
      throw new Error('boom')
    })
    expect(registry.snapshot()).toEqual({ analysis: true, mailer: false })
  })
})
