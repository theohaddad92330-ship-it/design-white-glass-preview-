/**
 * #4267.4 — LA REPRISE, SUR UNE VRAIE BASE : « garder ses 3 suivis les plus récents, archiver le reste ».
 *
 * La spec sœur lit le TEXTE du SQL ; celle-ci exécute `up()` sur un PostgreSQL réel et lit ce que la
 * base a écrit. Une fenêtre `ROW_NUMBER()` mal partitionnée (par espace au lieu d'utilisateur), un tri
 * inversé ou un filtre de statut oublié passent la spec de texte et échouent ici.
 *
 * OPT-IN : `ACCOUNT_FOLLOWS_DB_TEST_URL` = une URL PostgreSQL qui peut `CREATE DATABASE`. La spec crée
 * une base jetable avec le strict minimum que la migration lit (`auth.users`, `auth.uid()`,
 * `workspaces`, `workspace_members`, `accounts`), puis la détruit. Le commutateur est lu à la
 * COLLECTE : posé, une base injoignable échoue bruyamment au lieu de passer en silence.
 *
 *   ACCOUNT_FOLLOWS_DB_TEST_URL=postgresql://postgres@localhost:5432/postgres \
 *     npx jest src/migrations/__tests__/1796560290696-AccountFollows.db
 */
import { Client } from 'pg'
import { AccountFollows1796560290696 } from '../1796560290696-AccountFollows'

const ADMIN_URL = process.env.ACCOUNT_FOLLOWS_DB_TEST_URL
const maybe = (): jest.It => (ADMIN_URL ? it : it.skip)
const DB_NAME = `account_follows_${process.pid}`

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CAROL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'

let admin: Client | undefined
let db: Client | undefined

const accountId = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('AccountFollows1796560290696 — la reprise sur une vraie base (#4267.4)', () => {
  beforeAll(async () => {
    if (!ADMIN_URL) return
    admin = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 5000 })
    // Un client dont la base disparaît au démontage émet `error` : sans écouteur, jest le compte en échec.
    admin.on('error', () => undefined)
    await admin.connect()
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`)
    await admin.query(`CREATE DATABASE ${DB_NAME}`)
    const url = new URL(ADMIN_URL)
    url.pathname = `/${DB_NAME}`
    db = new Client({ connectionString: url.toString() })
    db.on('error', () => undefined)
    await db.connect()
    await db.query(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
      CREATE TABLE workspaces (id uuid PRIMARY KEY);
      CREATE TABLE workspace_members (workspace_id uuid, user_id uuid);
      CREATE TABLE accounts (
        id uuid PRIMARY KEY, user_id uuid NOT NULL, workspace_id uuid,
        commercial_status text NOT NULL, status text NOT NULL, updated_at timestamptz NOT NULL
      );
    `)
    await db.query(`INSERT INTO auth.users (id) VALUES ($1), ($2), ($3)`, [ALICE, BOB, CAROL])
    await db.query(`INSERT INTO workspaces (id) VALUES ($1), ($2)`, [WS_A, WS_B])

    const account = (n: number, user: string, ws: string, commercial: string, status: string, daysAgo: number) =>
      db!.query(
        `INSERT INTO accounts (id, user_id, workspace_id, commercial_status, status, updated_at)
         VALUES ($1, $2, $3, $4, $5, now() - make_interval(days => $6))`,
        [accountId(n), user, ws, commercial, status, daysAgo],
      )
    // Alice : cinq comptes suivis sur DEUX espaces (le plafond est par UTILISATEUR), plus un compte
    // `inbox` très récent (jamais suivi) et un compte suivi mais supprimé (jamais repris).
    await account(1, ALICE, WS_A, 'watching', 'completed', 10)
    await account(2, ALICE, WS_A, 'customer', 'completed', 1)
    await account(3, ALICE, WS_B, 'opportunity', 'completed', 3)
    await account(4, ALICE, WS_B, 'watching', 'completed', 2)
    await account(5, ALICE, WS_A, 'watching', 'pending', 30)
    await account(6, ALICE, WS_A, 'inbox', 'completed', 0)
    await account(7, ALICE, WS_A, 'watching', 'deleted', 0)
    // Bob : deux comptes suivis — sous le plafond, tout reste suivi, rien n'est archivé.
    await account(8, BOB, WS_B, 'watching', 'completed', 5)
    await account(9, BOB, WS_B, 'opportunity', 'completed', 6)
    // Carol : aucun compte à statut suivi — elle ne suit rien.
    await account(10, CAROL, WS_A, 'archived', 'completed', 1)

    await new AccountFollows1796560290696().up({ query: (sql: string) => db!.query(sql) } as never)
  }, 30_000)

  afterAll(async () => {
    await db?.end().catch(() => undefined)
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`).catch(() => undefined)
      await admin.end().catch(() => undefined)
    }
  })

  const followsOf = async (user: string) =>
    (
      await db!.query<{ account_id: string; archived_reason: string | null }>(
        `SELECT account_id, archived_reason FROM account_follows WHERE user_id = $1 ORDER BY account_id`,
        [user],
      )
    ).rows

  maybe()(
    'garde EXACTEMENT les 3 plus récents par utilisateur, tous espaces confondus, et archive le reste',
    async () => {
      const rows = await followsOf(ALICE)
      expect(rows.filter(r => r.archived_reason === null).map(r => r.account_id)).toEqual([
        accountId(2),
        accountId(3),
        accountId(4),
      ])
      expect(rows.filter(r => r.archived_reason === 'migration_cap').map(r => r.account_id)).toEqual([
        accountId(1),
        accountId(5),
      ])
    },
  )

  maybe()('ne reprend ni un compte non suivi, ni un compte supprimé', async () => {
    const ids = (await followsOf(ALICE)).map(r => r.account_id)
    expect(ids).not.toContain(accountId(6))
    expect(ids).not.toContain(accountId(7))
    expect(await followsOf(CAROL)).toEqual([])
  })

  maybe()('sous le plafond, tout reste suivi', async () => {
    const rows = await followsOf(BOB)
    expect(rows).toHaveLength(2)
    expect(rows.every(r => r.archived_reason === null)).toBe(true)
  })

  maybe()('le statut commercial n’est pas modifié', async () => {
    const { rows } = await db!.query<{ commercial_status: string }>(
      `SELECT commercial_status FROM accounts WHERE id = $1`,
      [accountId(1)],
    )
    expect(rows[0]?.commercial_status).toBe('watching')
  })

  maybe()('rejouée, la reprise ne touche plus personne — même après un nouveau compte classé suivi', async () => {
    await db!.query(
      `INSERT INTO accounts (id, user_id, workspace_id, commercial_status, status, updated_at)
       VALUES ($1, $2, $3, 'watching', 'completed', now())`,
      [accountId(11), ALICE, WS_A],
    )
    const before = (await db!.query(`SELECT count(*)::int AS n FROM account_follows`)).rows[0].n as number
    await new AccountFollows1796560290696().up({ query: (sql: string) => db!.query(sql) } as never)
    const after = (await db!.query(`SELECT count(*)::int AS n FROM account_follows`)).rows[0].n as number
    expect(after).toBe(before)
  })

  maybe()('effacer un compte emporte son suivi (ON DELETE CASCADE — le reset démo ne casse pas)', async () => {
    await db!.query(`DELETE FROM accounts WHERE id = $1`, [accountId(8)])
    expect((await followsOf(BOB)).map(r => r.account_id)).toEqual([accountId(9)])
  })
})
