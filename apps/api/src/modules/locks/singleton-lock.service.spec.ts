import { SingletonLockService, withSingletonLock } from './singleton-lock.service'

/**
 * Shared fake Redis: a single key/value store that every mocked client sees,
 * so two service instances behave like two replicas contending on the same
 * Redis. Only `SET key val EX ttl NX` semantics are emulated — first caller
 * gets 'OK', everyone else null until the key is (never, here) expired.
 */
const sharedStore = new Map<string, string>()
let setImpl: ((key: string, value: string) => Promise<'OK' | null>) | null = null

jest.mock('ioredis', () => {
  const ctor = jest.fn(() => ({
    set: jest.fn((key: string, value: string) => {
      if (setImpl) return setImpl(key, value)
      if (sharedStore.has(key)) return Promise.resolve(null)
      sharedStore.set(key, value)
      return Promise.resolve('OK')
    }),
    quit: jest.fn().mockResolvedValue('OK'),
  }))
  return { __esModule: true, default: ctor }
})

describe('SingletonLockService', () => {
  const REAL_ENV = process.env

  beforeEach(() => {
    sharedStore.clear()
    setImpl = null
    process.env = { ...REAL_ENV, REDIS_URL: 'redis://localhost:6379' }
  })

  afterEach(() => {
    process.env = REAL_ENV
    jest.clearAllMocks()
  })

  it('two concurrent executions of the same lock → only one runs (N replicas, same cron tick)', async () => {
    const replicaA = new SingletonLockService()
    const replicaB = new SingletonLockService()

    let runs = 0
    const job = async (): Promise<void> => {
      runs += 1
    }

    const [ranA, ranB] = await Promise.all([
      replicaA.withLock('monthly-quota-reset', job),
      replicaB.withLock('monthly-quota-reset', job),
    ])

    expect(runs).toBe(1)
    // Exactly one replica won the tick.
    expect([ranA, ranB].filter(Boolean)).toHaveLength(1)
  })

  it('distinct lock names do not contend', async () => {
    const svc = new SingletonLockService()
    let runs = 0
    const job = async (): Promise<void> => {
      runs += 1
    }

    expect(await svc.withLock('cron-a', job)).toBe(true)
    expect(await svc.withLock('cron-b', job)).toBe(true)
    expect(runs).toBe(2)
  })

  it('a second tick on the SAME replica is also skipped while the lock is held (no release)', async () => {
    const svc = new SingletonLockService()
    let runs = 0
    const job = async (): Promise<void> => {
      runs += 1
    }

    expect(await svc.withLock('cron-a', job)).toBe(true)
    expect(await svc.withLock('cron-a', job)).toBe(false)
    expect(runs).toBe(1)
  })

  it('without REDIS_URL (dev, single instance) the fn runs directly — behaviour unchanged', async () => {
    process.env = { ...REAL_ENV }
    delete process.env['REDIS_URL']
    const svc = new SingletonLockService()
    let runs = 0

    const ran = await svc.withLock('cron-a', async () => {
      runs += 1
    })

    expect(ran).toBe(true)
    expect(runs).toBe(1)
  })

  it('fails open when Redis errors: the job still runs (a lock outage must not silently kill crons)', async () => {
    setImpl = () => Promise.reject(new Error('redis down'))
    const svc = new SingletonLockService()
    let runs = 0

    const ran = await svc.withLock('cron-a', async () => {
      runs += 1
    })

    expect(ran).toBe(true)
    expect(runs).toBe(1)
  })

  it('propagates fn errors to the caller (cron sites keep their own try/catch)', async () => {
    const svc = new SingletonLockService()
    await expect(
      svc.withLock('cron-a', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
  })

  it('onModuleDestroy closes the Redis client (graceful shutdown)', async () => {
    const svc = new SingletonLockService()
    await expect(svc.onModuleDestroy()).resolves.toBeUndefined()
  })
})

describe('withSingletonLock helper', () => {
  const REAL_ENV = process.env

  afterEach(() => {
    process.env = REAL_ENV
    jest.clearAllMocks()
  })

  it('runs the fn directly when no lock service is wired (direct-`new` specs, dev)', async () => {
    let runs = 0
    await withSingletonLock(undefined, 'cron-a', async () => {
      runs += 1
    })
    expect(runs).toBe(1)
  })

  it('delegates to the lock service when wired', async () => {
    const locks = { withLock: jest.fn().mockResolvedValue(true) }
    const fn = async (): Promise<void> => {}
    await withSingletonLock(locks as unknown as SingletonLockService, 'cron-a', fn)
    expect(locks.withLock).toHaveBeenCalledWith('cron-a', fn)
  })
})
