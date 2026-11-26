/**
 * #4016 L12 — AVANT que `DISCOVER_ALERT_DISPATCH_ENABLED` puisse être allumé,
 * les lignes `weekly_digest = true` que personne n'a jamais cochées repassent à
 * `false` (pas de spam au premier envoi). La migration est IDEMPOTENTE et ne
 * touche JAMAIS un choix : une ligne réécrite depuis sa création est un choix.
 *
 * Preuve contre un VRAI Postgres, sans dépendre des 800 migrations : deux
 * tables TEMPORAIRES (`notification_preferences`, `_migrations`) portant
 * exactement les colonnes que la migration lit. Opt-in comme les autres
 * `*.db.spec.ts` : `PG_TEST_URL` posé ; sans lui, la suite est sautée.
 */
import { Client } from 'pg'
import type { QueryRunner } from 'typeorm'
import { WeeklyDigestResetNeverTicked1796440190377 } from '../1796440190377-WeeklyDigestResetNeverTicked'

const DB_TEST_ENABLED = Boolean(process.env.PG_TEST_URL)
const suite = DB_TEST_ENABLED ? describe : describe.skip

const COLUMN_ADDED_AT = '2026-08-01T00:00:00Z'
const BEFORE_COLUMN = '2026-07-01T00:00:00Z'
const AFTER_COLUMN = '2026-09-01T00:00:00Z'

suite('WeeklyDigestResetNeverTicked1796440190377 — contre un vrai Postgres', () => {
  let client: Client
  let runner: QueryRunner

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.PG_TEST_URL })
    await client.connect()
    runner = { query: (sql: string, params?: unknown[]) => client.query(sql, params).then(r => r.rows) } as QueryRunner
  })

  afterAll(async () => {
    await client?.end().catch(() => undefined)
  })

  beforeEach(async () => {
    await client.query(`DROP TABLE IF EXISTS pg_temp.notification_preferences, pg_temp._migrations`)
    await client.query(`
      CREATE TEMP TABLE _migrations (id serial primary key, timestamp bigint NOT NULL, name varchar NOT NULL)`)
    await client.query(`
      CREATE TEMP TABLE notification_preferences (
        user_id text PRIMARY KEY,
        weekly_digest boolean NOT NULL DEFAULT false,
        newsletter_last_entry_id text,
        weekly_digest_swept_at timestamptz,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL)`)
    await client.query(`INSERT INTO _migrations (timestamp, name) VALUES ($1, 'WeeklyDigestPreference1785890000000')`, [
      Date.parse(COLUMN_ADDED_AT),
    ])
  })

  const insert = (
    user: string,
    o: { digest: boolean; created: string; updated?: string; marker?: string | null },
  ): Promise<unknown> =>
    client.query(
      `INSERT INTO notification_preferences (user_id, weekly_digest, newsletter_last_entry_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [user, o.digest, o.marker ?? null, o.created, o.updated ?? o.created],
    )

  const digestOf = async (user: string): Promise<boolean> =>
    (await client.query(`SELECT weekly_digest FROM notification_preferences WHERE user_id = $1`, [user])).rows[0]
      .weekly_digest

  const migration = new WeeklyDigestResetNeverTicked1796440190377()

  it('remet à zéro une ligne antérieure à la colonne, jamais réécrite — le `true` backfillé', async () => {
    await insert('backfilled', { digest: true, created: BEFORE_COLUMN })
    await migration.up(runner)
    expect(await digestOf('backfilled')).toBe(false)
  })

  it('remet à zéro une ligne semée par la newsletter (marqueur), jamais réécrite', async () => {
    await insert('seeded', { digest: true, created: AFTER_COLUMN, marker: 'entry-1' })
    await migration.up(runner)
    expect(await digestOf('seeded')).toBe(false)
  })

  it('NE TOUCHE PAS une ligne réécrite depuis sa création : c’est un choix', async () => {
    await insert('chosen', { digest: true, created: BEFORE_COLUMN, updated: AFTER_COLUMN })
    await migration.up(runner)
    expect(await digestOf('chosen')).toBe(true)
  })

  it('NE TOUCHE PAS une ligne créée après la colonne sans marqueur (écrite par un geste)', async () => {
    await insert('after', { digest: true, created: AFTER_COLUMN })
    await migration.up(runner)
    expect(await digestOf('after')).toBe(true)
  })

  it('trace chaque ligne touchée dans `weekly_digest_swept_at`, et seulement celles-là', async () => {
    await insert('backfilled', { digest: true, created: BEFORE_COLUMN })
    await insert('chosen', { digest: true, created: BEFORE_COLUMN, updated: AFTER_COLUMN })
    await migration.up(runner)
    const rows = (await client.query(`SELECT user_id, weekly_digest_swept_at FROM notification_preferences`)).rows
    const byUser = Object.fromEntries(rows.map(r => [r.user_id, r.weekly_digest_swept_at]))
    expect(byUser['backfilled']).not.toBeNull()
    expect(byUser['chosen']).toBeNull()
  })

  it('est IDEMPOTENTE : une seconde passe ne change rien', async () => {
    await insert('backfilled', { digest: true, created: BEFORE_COLUMN })
    await migration.up(runner)
    const first = (await client.query(`SELECT * FROM notification_preferences ORDER BY user_id`)).rows
    await migration.up(runner)
    const second = (await client.query(`SELECT * FROM notification_preferences ORDER BY user_id`)).rows
    expect(second).toEqual(first)
  })

  it('fail closed : migration de la colonne introuvable → seule la signature « marqueur » compte', async () => {
    await client.query(`DELETE FROM _migrations`)
    await insert('predates', { digest: true, created: BEFORE_COLUMN })
    await insert('seeded', { digest: true, created: BEFORE_COLUMN, marker: 'entry-1' })
    await migration.up(runner)
    expect(await digestOf('predates')).toBe(true)
    expect(await digestOf('seeded')).toBe(false)
  })
})
