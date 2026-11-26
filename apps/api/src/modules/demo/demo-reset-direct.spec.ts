import { Test } from '@nestjs/testing'
import { getDataSourceToken } from '@nestjs/typeorm'
import { DirectDbService, type DirectPgClient } from '../../database/direct-db.service'
import { DEMO_DOSSIERS } from './demo-dataset'
import {
  DEMO_PURGE_JOIN_TABLES,
  DEMO_PURGE_TABLES,
  DEMO_PURGE_USER_TABLES,
  DemoResetService,
} from './demo-reset.service'
import { DemoSeedService } from './demo-seed.service'

/**
 * Incident pool du 04/10/2026 — avec la connexion DIRECTE configurée, le verrou
 * de re-semis et la purge (65-184 s, 258 tables) passent par la connexion
 * dédiée hors pooler transaction, plus par le pool des requêtes utilisateurs.
 * Sans elle : chemin d'avant, inchangé (couvert par demo-reset.service.spec.ts).
 */
function fakeDirect(opts: { lockGranted?: boolean; failOn?: RegExp } = {}) {
  const sent: string[] = []
  const client: DirectPgClient = {
    connect: async () => undefined,
    end: async () => undefined,
    on: () => undefined,
    query: async (sql: string, params: unknown[] = []) => {
      sent.push([sql, ...params.map(String)].join(' | '))
      if (opts.failOn?.test(sql)) throw new Error('deadlock detected')
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: opts.lockGranted ?? true }] }
      return { rows: [] }
    },
  }
  const exclusive = jest.fn(async <T>(work: (c: DirectPgClient) => Promise<T>) => work(client))
  return { direct: { configured: true, exclusive } as unknown as DirectDbService, sent, exclusive }
}

/** Salle tronquée (3 dossiers, ancienne) : la purge a lieu. */
function fakeDataSource() {
  return {
    transaction: jest.fn(),
    createQueryRunner: jest.fn(),
    query: jest.fn(async (sql: string) => {
      if (/missing|newest|dossiers/i.test(sql)) {
        return [{ newest: new Date('2020-01-01T00:00:00Z'), dossiers: 3, fingerprint: null }]
      }
      return []
    }),
  }
}

const seedWorkspace = jest.fn(async () => ({ seeded: true, accounts: DEMO_DOSSIERS.length }))

async function build(dataSource: unknown, direct: DirectDbService) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      DemoResetService,
      { provide: getDataSourceToken(), useValue: dataSource },
      { provide: DemoSeedService, useValue: { seedWorkspace } },
      { provide: DirectDbService, useValue: direct },
    ],
  }).compile()
  return moduleRef.get(DemoResetService)
}

describe('incident pool 04/10 — re-semis démo par la connexion DÉDIÉE hors pooler', () => {
  beforeEach(() => jest.clearAllMocks())

  it('verrou de SESSION sur la connexion dédiée, purge dedans (BEGIN…COMMIT), jamais par le pool partagé', async () => {
    const dataSource = fakeDataSource()
    const { direct, sent, exclusive } = fakeDirect()
    await (await build(dataSource, direct)).resetWorkspace('ws-demo', 'demo-user')

    expect(exclusive).toHaveBeenCalledTimes(1)
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled()
    expect(dataSource.transaction).not.toHaveBeenCalled()
    expect(sent[0]).toMatch(/pg_try_advisory_lock\(hashtext\(\$1\)\)/)
    expect(sent[0]).not.toMatch(/xact/)
    expect(sent[0]).toContain('bellum:demo-reset:ws-demo')
    const begin = sent.findIndex(s => s === 'BEGIN')
    const commit = sent.findIndex(s => s === 'COMMIT')
    expect(begin).toBeGreaterThan(0)
    expect(commit).toBeGreaterThan(begin)
    // Toutes les tables de la purge, dans le même ordre que le chemin d'avant.
    const deleted = sent.filter(s => s.startsWith('DELETE FROM')).map(s => /DELETE FROM "([a-z_]+)"/.exec(s)?.[1])
    expect(deleted).toEqual([
      ...DEMO_PURGE_JOIN_TABLES.map(t => t.table),
      ...DEMO_PURGE_USER_TABLES,
      ...DEMO_PURGE_TABLES,
    ])
    // Le détachement des FK sans ON DELETE précède toujours sa table.
    const detachBu = sent.findIndex(s => /UPDATE missions SET business_unit_id = NULL/.test(s))
    expect(detachBu).toBeLessThan(sent.findIndex(s => s.startsWith('DELETE FROM "business_units"')))
    // Le semis passe APRÈS le COMMIT de la purge, verrou toujours tenu, relâché à la fin.
    expect(seedWorkspace).toHaveBeenCalledWith('ws-demo', 'demo-user')
    expect(sent[sent.length - 1]).toMatch(/pg_advisory_unlock\(hashtext\(\$1\)\)/)
  })

  it('verrou NON obtenu : ni purge ni semis (un autre réplica s’en charge)', async () => {
    const { direct, sent } = fakeDirect({ lockGranted: false })
    const outcome = await (await build(fakeDataSource(), direct)).resetWorkspace('ws-demo', 'demo-user')

    expect(outcome.skipped).toBe(true)
    expect(sent.some(s => s.startsWith('DELETE'))).toBe(false)
    expect(seedWorkspace).not.toHaveBeenCalled()
  })

  it('purge en échec : ROLLBACK, verrou relâché, erreur remontée', async () => {
    const { direct, sent } = fakeDirect({ failOn: /DELETE FROM "contacts"/ })
    await expect((await build(fakeDataSource(), direct)).resetWorkspace('ws-demo', 'demo-user')).rejects.toThrow(
      /deadlock/,
    )
    expect(sent).toContain('ROLLBACK')
    expect(sent[sent.length - 1]).toMatch(/pg_advisory_unlock/)
    expect(seedWorkspace).not.toHaveBeenCalled()
  })

  it('les identifiants de la purge brute sont des constantes, jamais une entrée : l’espace part en paramètre', async () => {
    const { direct, sent } = fakeDirect()
    await (await build(fakeDataSource(), direct)).resetWorkspace("ws'; DROP TABLE x; --", 'demo-user')
    for (const s of sent.filter(q => q.startsWith('DELETE'))) {
      expect(s.split(' | ')[0]).not.toContain('DROP')
    }
  })
})
