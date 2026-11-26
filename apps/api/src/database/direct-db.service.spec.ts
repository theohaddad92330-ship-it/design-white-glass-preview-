import { Logger } from '@nestjs/common'
import { EventEmitter } from 'node:events'
import { DirectDbService, type DirectPgClient } from './direct-db.service'

/**
 * Incident pool du 04/10/2026 — UNE connexion dédiée, directe/session, hors du
 * pool des requêtes utilisateurs : pour élire le réplica qui balaie la démo
 * (verrou consultatif de SESSION, fiable hors pooler transaction) et pour y
 * faire passer la purge lourde.
 */
class FakeClient extends EventEmitter implements DirectPgClient {
  readonly sent: string[] = []
  connected = false
  ended = false
  constructor(private readonly answer: (sql: string) => unknown[] = () => []) {
    super()
  }
  async connect(): Promise<void> {
    this.connected = true
  }
  async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[] }> {
    this.sent.push([sql, ...params.map(String)].join(' | '))
    return { rows: this.answer(sql) }
  }
  async end(): Promise<void> {
    this.ended = true
  }
}

const DIRECT_ENV = { POSTGRES_HOST: 'pooler', POSTGRES_PORT: '6543', POSTGRES_DIRECT_PORT: '5432' }

function build(env: Record<string, string>, answer?: (sql: string) => unknown[]) {
  const clients: FakeClient[] = []
  const service = new DirectDbService(env, () => {
    const c = new FakeClient(answer)
    clients.push(c)
    return c
  })
  return { service, clients }
}

describe('DirectDbService — la connexion dédiée hors pooler', () => {
  afterEach(() => jest.restoreAllMocks())

  it('sans POSTGRES_DIRECT_PORT : non configurée, avertit UNE fois, n’ouvre rien', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const { service, clients } = build({ POSTGRES_HOST: 'pooler', POSTGRES_PORT: '6543' })
    expect(service.configured).toBe(false)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('POSTGRES_DIRECT_PORT'))
    expect(clients).toHaveLength(0)
  })

  it('UNE seule connexion : deux travaux concurrents passent l’un après l’autre sur le même client', async () => {
    const { service, clients } = build(DIRECT_ENV)
    const order: string[] = []
    let release: () => void = () => undefined
    const first = service.exclusive(async client => {
      order.push('start:1')
      await new Promise<void>(resolve => (release = resolve))
      await client.query('SELECT 1')
      order.push('end:1')
    })
    const second = service.exclusive(async () => {
      order.push('start:2')
    })
    await new Promise(resolve => setImmediate(resolve))
    release()
    await Promise.all([first, second])
    expect(order).toEqual(['start:1', 'end:1', 'start:2'])
    expect(clients).toHaveLength(1)
  })

  it('la session dédiée borne ses instructions (statement_timeout) dès la connexion', async () => {
    const { service, clients } = build(DIRECT_ENV)
    await service.exclusive(async () => undefined)
    expect(clients[0]?.sent[0]).toMatch(/statement_timeout/)
    expect(clients[0]?.sent.join('\n')).toMatch(/idle_in_transaction_session_timeout/)
  })

  it('élection : verrou consultatif de SESSION, demandé une fois puis tenu tant que la connexion vit', async () => {
    const { service, clients } = build(DIRECT_ENV, sql =>
      sql.includes('pg_try_advisory_lock') ? [{ taken: true }] : [],
    )
    expect(await service.isLeader('bellum:demo-sweep')).toBe(true)
    expect(await service.isLeader('bellum:demo-sweep')).toBe(true)
    const lockQueries = clients[0]!.sent.filter(s => s.includes('pg_try_advisory_lock'))
    expect(lockQueries).toHaveLength(1)
    // Session, pas transaction : `pg_try_advisory_xact_lock` ne survivrait pas.
    expect(lockQueries[0]).not.toMatch(/xact/)
  })

  it('élection perdue : pas leader, et la connexion inutile est relâchée', async () => {
    const { service, clients } = build(DIRECT_ENV, sql =>
      sql.includes('pg_try_advisory_lock') ? [{ taken: false }] : [],
    )
    expect(await service.isLeader('bellum:demo-sweep')).toBe(false)
    expect(clients[0]?.ended).toBe(true)
  })

  it('connexion perdue : le leadership tombe avec elle (Postgres a relâché le verrou), on le redemande', async () => {
    const { service, clients } = build(DIRECT_ENV, sql =>
      sql.includes('pg_try_advisory_lock') ? [{ taken: true }] : [],
    )
    expect(await service.isLeader('k')).toBe(true)
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    clients[0]!.emit('error', new Error('Connection terminated unexpectedly'))
    expect(await service.isLeader('k')).toBe(true)
    expect(clients).toHaveLength(2)
  })

  it('non configurée : exclusive() refuse (l’appelant garde son chemin d’avant)', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const { service } = build({})
    await expect(service.exclusive(async () => 1)).rejects.toThrow(/POSTGRES_DIRECT_PORT/)
  })
})
