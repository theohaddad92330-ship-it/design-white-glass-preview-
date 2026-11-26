import { EventEmitter } from 'node:events'
import type { DataSource } from 'typeorm'
import {
  describePoolState,
  PgPoolStallTracker,
  PgPoolWatchdogService,
  POOL_STALL_EXIT_AFTER_MS,
} from './pg-pool-watchdog'

/**
 * INC-04-10 — le 04/10/2026, le pool est resté bloqué 50 min (« timeout exceeded
 * when trying to connect ») alors que la base était saine ; un redémarrage a
 * suffi. Le chien de garde fait ce redémarrage tout seul — et SEULEMENT quand
 * toutes les tentatives échouent ainsi pendant ≥ 3 min sans une réussite.
 */
const CHECKOUT_TIMEOUT = new Error('timeout exceeded when trying to connect')
const MIN = 60_000

describe('PgPoolStallTracker', () => {
  it('says NO before 3 minutes of checkout timeouts', () => {
    const t = new PgPoolStallTracker()
    expect(t.recordFailure(CHECKOUT_TIMEOUT, 0)).toBe(false)
    expect(t.recordFailure(CHECKOUT_TIMEOUT, 2 * MIN)).toBe(false)
    expect(t.recordFailure(CHECKOUT_TIMEOUT, 3 * MIN - 1)).toBe(false)
  })

  it('says YES once checkout timeouts have lasted 3 minutes in a row', () => {
    const t = new PgPoolStallTracker()
    t.recordFailure(CHECKOUT_TIMEOUT, 0)
    t.recordFailure(CHECKOUT_TIMEOUT, MIN)
    expect(t.recordFailure(CHECKOUT_TIMEOUT, POOL_STALL_EXIT_AFTER_MS)).toBe(true)
  })

  it('a single success in between resets the streak', () => {
    const t = new PgPoolStallTracker()
    t.recordFailure(CHECKOUT_TIMEOUT, 0)
    t.recordFailure(CHECKOUT_TIMEOUT, 2 * MIN)
    t.recordSuccess()
    expect(t.recordFailure(CHECKOUT_TIMEOUT, 3 * MIN)).toBe(false)
    expect(t.recordFailure(CHECKOUT_TIMEOUT, 5 * MIN)).toBe(false)
    expect(t.recordFailure(CHECKOUT_TIMEOUT, 6 * MIN)).toBe(true)
  })

  it('ignores errors that are not checkout timeouts (a failing query is not a wedged pool)', () => {
    const t = new PgPoolStallTracker()
    expect(t.recordFailure(new Error('relation "x" does not exist'), 0)).toBe(false)
    expect(t.recordFailure(new Error('Query read timeout'), 10 * MIN)).toBe(false)
    // The streak only starts at the first checkout timeout.
    expect(t.recordFailure(CHECKOUT_TIMEOUT, 10 * MIN)).toBe(false)
    expect(t.recordFailure(CHECKOUT_TIMEOUT, 12 * MIN)).toBe(false)
  })
})

describe('PgPoolWatchdogService', () => {
  function build(query: jest.Mock) {
    const pool = new EventEmitter()
    const dataSource = { isInitialized: true, query, driver: { master: pool } } as unknown as DataSource
    let clock = 0
    const exit = jest.fn()
    const service = new PgPoolWatchdogService(dataSource)
    Object.assign(service, { now: () => clock, exitProcess: exit })
    jest
      .spyOn((service as unknown as { logger: { error: jest.Mock } }).logger, 'error')
      .mockImplementation(() => undefined)
    return { service, pool, exit, advance: (ms: number) => (clock += ms) }
  }

  it('exits the process after 3 minutes of probes failing on checkout timeout', async () => {
    const query = jest.fn().mockRejectedValue(CHECKOUT_TIMEOUT)
    const { service, exit, advance } = build(query)

    await service.tick()
    for (let i = 0; i < 6; i += 1) {
      advance(30_000)
      await service.tick()
    }
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('does NOT exit when real traffic acquires a client between failed probes', async () => {
    const query = jest.fn().mockRejectedValue(CHECKOUT_TIMEOUT)
    const { service, pool, exit, advance } = build(query)
    service.attachPoolListeners()

    await service.tick()
    for (let i = 0; i < 6; i += 1) {
      advance(30_000)
      pool.emit('acquire') // une requête HTTP a obtenu un client
      await service.tick()
    }
    expect(exit).not.toHaveBeenCalled()
  })

  it('does NOT exit when the probe succeeds', async () => {
    const query = jest.fn().mockResolvedValue([{ '?column?': 1 }])
    const { service, exit, advance } = build(query)
    for (let i = 0; i < 10; i += 1) {
      advance(30_000)
      await service.tick()
    }
    expect(exit).not.toHaveBeenCalled()
  })
})

/**
 * #4616 — 51 issues Sentry « timeout exceeded when trying to connect » pour UNE cause : le journal ne disait
 * pas l'état du pool au moment du timeout (combien de connexions tenues, combien de requêtes en file).
 */
describe('#4616 — le journal dit l’état du pool quand un checkout échoue', () => {
  it('describePoolState : connexions tenues, libres, en file, plafond — jamais la config de connexion', () => {
    const pool = { totalCount: 5, idleCount: 0, waitingCount: 7, options: { max: 5, password: 'secret', host: 'h' } }
    const line = describePoolState(pool)
    expect(line).toBe('pool 5/5 connexions, 0 libres, 7 en file')
    expect(line).not.toContain('secret')
  })

  it('describePoolState : un pool illisible se dit, il ne devient pas « 0 »', () => {
    expect(describePoolState(undefined)).toBe('pool illisible')
    expect(describePoolState({ totalCount: 'x' })).toBe('pool illisible')
  })

  it('un timeout de checkout journalise une fois par minute l’état du pool ; une erreur SQL ne le fait pas', async () => {
    const pool = Object.assign(new EventEmitter(), {
      totalCount: 5,
      idleCount: 0,
      waitingCount: 3,
      options: { max: 5 },
    })
    const query = jest.fn().mockRejectedValue(CHECKOUT_TIMEOUT)
    const dataSource = { isInitialized: true, query, driver: { master: pool } } as unknown as DataSource
    let clock = 0
    const service = new PgPoolWatchdogService(dataSource)
    Object.assign(service, { now: () => clock, exitProcess: jest.fn() })
    const warn = jest
      .spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
      .mockImplementation(() => undefined)

    await service.tick()
    clock += 30_000
    await service.tick()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('pool 5/5 connexions, 0 libres, 3 en file')
    clock += 31_000
    await service.tick()
    expect(warn).toHaveBeenCalledTimes(2)

    warn.mockClear()
    query.mockRejectedValue(new Error('relation "x" does not exist'))
    clock += 120_000
    await service.tick()
    expect(warn).not.toHaveBeenCalled()
  })
})

/**
 * #4616.2 — l'état du pool AVANT la saturation : une ligne par minute dès que des requêtes attendent ou que les
 * connexions tenues atteignent 80 % du plafond, sans attendre qu'un checkout échoue. Un pool au repos ne dit rien.
 */
describe('#4616.2 — le journal dit les connexions en vol sous charge', () => {
  function build(pool: Record<string, unknown>) {
    const query = jest.fn().mockResolvedValue([{ '?column?': 1 }])
    const dataSource = {
      isInitialized: true,
      query,
      driver: { master: Object.assign(new EventEmitter(), pool) },
    } as unknown as DataSource
    let clock = 0
    const service = new PgPoolWatchdogService(dataSource)
    Object.assign(service, { now: () => clock, exitProcess: jest.fn() })
    const warn = jest
      .spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
      .mockImplementation(() => undefined)
    return { service, warn, advance: (ms: number) => (clock += ms) }
  }

  it('des requêtes en file : une ligne par minute, même quand la sonde réussit', async () => {
    const { service, warn, advance } = build({ totalCount: 3, idleCount: 3, waitingCount: 2, options: { max: 10 } })
    await service.tick()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('pool 3/10 connexions, 3 libres, 2 en file')
    advance(30_000)
    await service.tick()
    expect(warn).toHaveBeenCalledTimes(1)
    advance(31_000)
    await service.tick()
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('connexions tenues ≥ 80 % du plafond : la ligne part sans aucune file', async () => {
    const { service, warn } = build({ totalCount: 8, idleCount: 0, waitingCount: 0, options: { max: 10 } })
    await service.tick()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('sait dire NON : un pool au repos ne journalise rien, ni un pool plein de connexions LIBRES', async () => {
    const calm = build({ totalCount: 2, idleCount: 2, waitingCount: 0, options: { max: 10 } })
    await calm.service.tick()
    expect(calm.warn).not.toHaveBeenCalled()
    const idleFull = build({ totalCount: 10, idleCount: 8, waitingCount: 0, options: { max: 10 } })
    await idleFull.service.tick()
    expect(idleFull.warn).not.toHaveBeenCalled()
  })

  it('un pool illisible ne produit pas une ligne de charge', async () => {
    const { service, warn } = build({})
    await service.tick()
    expect(warn).not.toHaveBeenCalled()
  })
})
