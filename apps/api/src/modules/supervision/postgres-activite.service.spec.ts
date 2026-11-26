import { Logger } from '@nestjs/common'
import { PG_ACTIVITY_SQL, PostgresActiviteService, resumerActivite } from './postgres-activite.service'

/**
 * Incident pool du 04/10/2026 (soir) — la cause n'a pas pu être tranchée :
 * `pg_stat_activity` illisible au moment où il fallait le lire (psql via le
 * pooler saturé → ECHECKOUTTIMEOUT). Le relevé passe par la connexion
 * DIRECTE/session, hors du pool des requêtes, et ne porte JAMAIS le texte d'une
 * requête d'utilisateur.
 */
describe('resumerActivite — agrégat de pg_stat_activity', () => {
  const now = new Date('2026-10-04T16:40:00Z')

  it('compte par état et par type d’attente, nomme les « idle in transaction » > 30 s et la plus vieille transaction', () => {
    const r = resumerActivite(
      [
        { state: 'active', wait_event_type: 'IO', n: 3, idle_tx_30s: 0, oldest_xact_start: '2026-10-04T16:39:00Z' },
        {
          state: 'idle in transaction',
          wait_event_type: 'Client',
          n: 2,
          idle_tx_30s: 1,
          oldest_xact_start: '2026-10-04T16:37:00Z',
        },
        { state: 'idle', wait_event_type: 'Client', n: 10, idle_tx_30s: 0, oldest_xact_start: null },
      ],
      now,
    )
    expect(r.total).toBe(15)
    expect(r.parEtat).toEqual({ active: 3, 'idle in transaction': 2, idle: 10 })
    expect(r.parTypeAttente).toEqual({ IO: 3, Client: 12 })
    expect(r.idleInTransactionPlusDe30s).toBe(1)
    expect(r.plusVieilleTransactionSecondes).toBe(180)
  })

  it('aucune transaction ouverte : l’âge est ABSENT (null), jamais « 0 »', () => {
    const r = resumerActivite(
      [{ state: 'idle', wait_event_type: null, n: 4, idle_tx_30s: 0, oldest_xact_start: null }],
      now,
    )
    expect(r.plusVieilleTransactionSecondes).toBeNull()
    expect(r.parTypeAttente).toEqual({ aucun: 4 })
  })
})

describe('PG_ACTIVITY_SQL — ce qui est lu', () => {
  it('ne lit JAMAIS la colonne query (texte des requêtes d’utilisateurs)', () => {
    expect(PG_ACTIVITY_SQL).not.toMatch(/\bquery\b/)
  })
  it('agrège côté serveur (GROUP BY), exclut sa propre connexion', () => {
    expect(PG_ACTIVITY_SQL).toMatch(/GROUP BY/)
    expect(PG_ACTIVITY_SQL).toMatch(/pg_backend_pid\(\)/)
  })
})

describe('PostgresActiviteService — relevé à la demande, borné', () => {
  afterEach(() => jest.restoreAllMocks())

  function fakeClient(rows: unknown[], fail = false) {
    const sent: string[] = []
    return {
      sent,
      client: {
        connect: jest.fn(async () => {
          if (fail) throw new Error('timeout')
        }),
        query: jest.fn(async (sql: string) => {
          sent.push(sql)
          return { rows: sql.includes('pg_stat_activity') ? rows : [] }
        }),
        end: jest.fn(async () => undefined),
      },
    }
  }

  it('lit sur un client COURT (connexion directe), borne l’instruction, ferme le client', async () => {
    const { client, sent } = fakeClient([
      { state: 'active', wait_event_type: null, n: 1, idle_tx_30s: 0, oldest_xact_start: null },
    ])
    const service = new PostgresActiviteService({ POSTGRES_DIRECT_PORT: '5432' }, () => client)
    const r = await service.releve()
    expect(r).toMatchObject({ etat: 'lu', connexion: 'directe', total: 1 })
    expect(sent[0]).toMatch(/statement_timeout/)
    expect(client.end).toHaveBeenCalled()
  })

  it('met en cache 60 s : deux lectures rapprochées = une seule requête', async () => {
    const { client } = fakeClient([])
    const service = new PostgresActiviteService({}, () => client)
    await service.releve()
    await service.releve()
    expect(client.connect).toHaveBeenCalledTimes(1)
  })

  it('base injoignable : « illisible » avec la raison, jamais un relevé vide', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const { client } = fakeClient([], true)
    const service = new PostgresActiviteService({}, () => client)
    const r = await service.releve()
    expect(r).toMatchObject({ etat: 'illisible', connexion: 'pooler' })
    expect(r).not.toHaveProperty('total')
  })
})
