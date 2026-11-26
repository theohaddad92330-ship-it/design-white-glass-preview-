/**
 * DB-LEVEL workspace isolation for the RAG store.
 *
 * The sibling spec asserts the migration's SQL text. This one asserts the
 * BEHAVIOUR, against a real PostgreSQL: what the database actually hands back.
 * A service-layer test can only prove the service asks the right question; only
 * this can prove the database refuses the wrong one.
 *
 * Two barriers are exercised, because in production they protect different
 * callers and only one of them is RLS:
 *
 *   1. `match_rag_documents` — the pgvector retrieval path. The IA connects with
 *      the SERVICE ROLE key, which BYPASSES RLS, so for the analysis pipeline this
 *      function's own predicate IS the barrier. (This is why scoping the
 *      full-text backend alone would have been a leak.)
 *   2. The `rag_documents_workspace_access` RLS policy — the backstop for anything
 *      reaching the table as `authenticated` (a Supabase JWT client).
 *
 * OPT-IN, and deliberately so. Set `PG_TEST_URL` (or `RAG_DB_TEST=1` to use the
 * standard local dev instance on port 5440 with `tools/dev.secret.sh`):
 *
 *   set -a; . tools/dev.secret.sh; set +a
 *   PG_TEST_URL="postgresql://postgres:$POSTGRES_PASSWORD@localhost:5440/postgres" \
 *     npx jest src/migrations/__tests__/1786970000000-RagWorkspaceScope.db
 *
 * The switch is read SYNCHRONOUSLY at collection time — a reachability probe in
 * `beforeAll` would run after `describe` has already chosen `it` vs `it.skip`, so
 * every test would silently skip and the file would look green while proving
 * nothing. When the switch IS set, a database that can't be reached fails loudly
 * rather than skipping: an opt-in boundary proof that quietly no-ops is worse than
 * no test at all. Without the switch, CI stays green without a database.
 */
import { Client } from 'pg'
import { RagWorkspaceScope1786970000000 } from '../1786970000000-RagWorkspaceScope'

const CONN =
  process.env.PG_TEST_URL ??
  `postgresql://${process.env.POSTGRES_USER ?? 'postgres'}:${process.env.POSTGRES_PASSWORD ?? 'postgres'}` +
    `@${process.env.POSTGRES_HOST ?? 'localhost'}:${process.env.POSTGRES_PORT ?? '5440'}/${process.env.POSTGRES_DB ?? 'postgres'}`

const WS_A = '11111111-1111-1111-1111-111111111111'
const WS_B = '22222222-2222-2222-2222-222222222222'
const ALICE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' // workspace A
const BOB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' // workspace A — Alice's colleague
const CAROL = 'cccccccc-cccc-cccc-cccc-cccccccccccc' // workspace B — another ESN

/** A 1536-d unit vector; every seeded doc gets the same one so cosine similarity
 *  is 1.0 for all of them and the ONLY thing that can filter a row out is scope. */
const VEC = `[${['1', ...Array(1535).fill('0')].join(',')}]`

/** Read synchronously, before `describe` picks `it` vs `it.skip` — see header. */
const DB_TEST_ENABLED = Boolean(process.env.PG_TEST_URL ?? process.env.RAG_DB_TEST)

let db: Client | undefined

afterAll(async () => {
  if (db) await db.end().catch(() => undefined)
})

const maybe = (): jest.It => (DB_TEST_ENABLED ? it : it.skip)

describe('RagWorkspaceScope1786970000000 — DB-level workspace isolation', () => {
  beforeAll(async () => {
    if (!DB_TEST_ENABLED) return
    // Fail loudly, never skip: the switch was set, so a missing database is an
    // error in the run, not a reason to pretend the boundary was proven.
    const client = new Client({ connectionString: CONN, connectionTimeoutMillis: 5000 })
    await client.connect()
    await client.query('SELECT 1 FROM rag_documents LIMIT 1')
    db = client

    const q = (sql: string, params?: unknown[]) => db!.query(sql, params)

    // Apply the migration under test (idempotent by construction).
    await new RagWorkspaceScope1786970000000().up({
      query: (sql: string) => q(sql),
    } as never)

    // Seed two tenants. auth.users rows carry FK targets for rag_documents.user_id.
    await q(`DELETE FROM rag_documents WHERE user_id = ANY($1::uuid[])`, [[ALICE, BOB, CAROL]])
    await q(`DELETE FROM workspace_members WHERE user_id = ANY($1::uuid[])`, [[ALICE, BOB, CAROL]])
    await q(`DELETE FROM workspaces WHERE id = ANY($1::uuid[])`, [[WS_A, WS_B]])
    await q(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [[ALICE, BOB, CAROL]])

    for (const [id, email] of [
      [ALICE, 'alice@test.local'],
      [BOB, 'bob@test.local'],
      [CAROL, 'carol@test.local'],
    ]) {
      await q(
        `INSERT INTO auth.users (id, email, instance_id, aud, role)
         VALUES ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
         ON CONFLICT (id) DO NOTHING`,
        [id, email],
      )
    }
    // The signup trigger auto-creates a workspace per user; drop those so the
    // fixture's two workspaces are the only ones in play.
    await q(`DELETE FROM workspace_members WHERE user_id = ANY($1::uuid[])`, [[ALICE, BOB, CAROL]])
    await q(`DELETE FROM workspaces WHERE owner_user_id = ANY($1::uuid[])`, [[ALICE, BOB, CAROL]])

    await q(`INSERT INTO workspaces (id, owner_user_id, name) VALUES ($1, $2, 'ESN A')`, [WS_A, ALICE])
    await q(`INSERT INTO workspaces (id, owner_user_id, name) VALUES ($1, $2, 'ESN B')`, [WS_B, CAROL])
    for (const [ws, u, role] of [
      [WS_A, ALICE, 'owner'],
      [WS_A, BOB, 'member'],
      [WS_B, CAROL, 'owner'],
      // Bob is ALSO a member of workspace B — the switcher case (#642): one
      // person, two legitimate workspaces, and only the active selection says
      // which knowledge base should ground his work right now.
      [WS_B, BOB, 'member'],
    ]) {
      await q(
        `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (workspace_id, user_id) DO NOTHING`,
        [ws, u, role],
      )
    }

    const doc = async (id: string, user: string, ws: string | null, title: string) =>
      q(
        `INSERT INTO rag_documents (id, user_id, workspace_id, title, content, category, embedding)
         VALUES ($1, $2, $3, $4, $5, 'ref', $6::extensions.vector)`,
        [id, user, ws, title, `${title} — corps`, VEC],
      )

    await doc('11111111-0000-0000-0000-000000000001', ALICE, WS_A, 'Reference Alice')
    await doc('11111111-0000-0000-0000-000000000002', BOB, WS_A, 'Cas client Bob')
    await doc('22222222-0000-0000-0000-000000000003', CAROL, WS_B, 'Cas client concurrent')
    await doc('11111111-0000-0000-0000-000000000004', ALICE, null, 'Legacy Alice')
    await doc('22222222-0000-0000-0000-000000000005', CAROL, null, 'Legacy concurrent')
  }, 30_000)

  /** Titles the RPC returns for a given scope. */
  const rpc = async (userId: string | null, workspaceId: string | null): Promise<string[]> => {
    const res = await db!.query(
      `SELECT title FROM match_rag_documents($1::extensions.vector, 0.5, 50, $2::uuid, $3::uuid)`,
      [VEC, userId, workspaceId],
    )
    return res.rows.map(r => r.title as string).sort()
  }

  // ---- Barrier 1: the pgvector RPC (the IA bypasses RLS via service_role) ----

  maybe()("retrieves a COLLEAGUE's document — the reported bug", async () => {
    const titles = await rpc(ALICE, WS_A)
    expect(titles).toContain('Cas client Bob')
  })

  maybe()("NEVER retrieves another workspace's documents", async () => {
    const titles = await rpc(ALICE, WS_A)
    expect(titles).not.toContain('Cas client concurrent')
    expect(titles).not.toContain('Legacy concurrent')
  })

  maybe()('workspace B cannot reach workspace A — the boundary, from the other side', async () => {
    const titles = await rpc(CAROL, WS_B)
    expect(titles).toEqual(['Cas client concurrent', 'Legacy concurrent'])
    expect(titles).not.toContain('Reference Alice')
    expect(titles).not.toContain('Cas client Bob')
  })

  maybe()('keeps a legacy NULL-workspace row reachable by its owner only', async () => {
    expect(await rpc(ALICE, WS_A)).toContain('Legacy Alice')
    // Same workspace, different member: the un-scoped row stays private to Alice,
    // so the backfill widens nothing it could not already derive.
    expect(await rpc(BOB, WS_A)).not.toContain('Legacy Alice')
  })

  maybe()('a member of TWO workspaces gets a different knowledge base in each (workspace switcher)', async () => {
    // Bob belongs to both. The workspace he is working in is the ONLY thing
    // that changes between these two calls, and it fully determines what
    // grounds his analysis — no bleed in either direction.
    const inA = await rpc(BOB, WS_A)
    const inB = await rpc(BOB, WS_B)

    expect(inA).toContain('Cas client Bob')
    expect(inA).toContain('Reference Alice') // his colleague's, in workspace A
    expect(inA).not.toContain('Cas client concurrent')

    expect(inB).toContain('Cas client concurrent')
    expect(inB).not.toContain('Cas client Bob')
    expect(inB).not.toContain('Reference Alice')

    // Neither view leaks the other workspace's legacy owner-private rows.
    expect(inA).not.toContain('Legacy concurrent')
    expect(inB).not.toContain('Legacy Alice')
  })

  maybe()('falls back to the legacy per-user scope when no workspace is passed', async () => {
    expect(await rpc(ALICE, null)).toEqual(['Legacy Alice', 'Reference Alice'])
  })

  maybe()('fails CLOSED when neither filter is supplied (was: every tenant)', async () => {
    expect(await rpc(null, null)).toEqual([])
  })

  // ---- Barrier 2: the RLS policy (authenticated clients) ----

  maybe()('RLS: rag_documents is guarded by a workspace-membership predicate', async () => {
    // Assert the policy the database actually holds — the backstop's shape, not a
    // reimplementation of it. This is `rag_documents_workspace_access` from
    // migration 1784600000001; the present migration deliberately does not touch
    // RLS, because the policy was already workspace-correct.
    const res = await db!.query(
      `SELECT polname, pg_get_expr(polqual, polrelid) AS predicate
         FROM pg_policy WHERE polrelid = 'rag_documents'::regclass`,
    )
    expect(res.rows).toHaveLength(1)
    const { polname, predicate } = res.rows[0] as { polname: string; predicate: string }
    expect(polname).toBe('rag_documents_workspace_access')
    // Team scope: membership of the row's workspace.
    expect(predicate).toContain('workspace_members')
    expect(predicate).toContain('auth.uid()')
    // Owner fallback for rows the backfill could not resolve — the same clause
    // `rag_service._scope` and `match_rag_documents` carry, so no layer is wider
    // than another.
    expect(predicate.replace(/\s+/g, ' ')).toContain('workspace_id IS NULL')
    expect(predicate).toContain('user_id = auth.uid()')
  })

  maybe()('RLS: KNOWN PRE-EXISTING DEFECT — an authenticated read recurses, so it fails CLOSED', async () => {
    // The `workspace_members` policy ("Members read memberships", migration
    // 1784600000001) subqueries `workspace_members` from within its own USING
    // clause, so it recurses. Every policy that resolves membership through that
    // table therefore errors for the `authenticated` role — including
    // `rag_documents`. This is NOT introduced here (this migration touches no
    // policy) and it does not leak: the failure mode is an error, i.e. zero rows.
    //
    // It also never fires in production: the API connects as `postgres`
    // (BYPASSRLS), the IA as `service_role` (BYPASSRLS), and the SPA makes no
    // direct table reads. The barrier that actually protects the analysis
    // pipeline is `match_rag_documents`, proven above.
    //
    // Pinned rather than fixed: repairing it means editing the workspace
    // membership policy, which another agent currently owns (workspace
    // join/switcher). Flagged for them. When they fix it, this test SHOULD fail —
    // replace it with the end-to-end assertion it stands in for.
    await db!.query('BEGIN')
    try {
      await db!.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: CAROL, role: 'authenticated' }),
      ])
      await db!.query(`SET LOCAL ROLE authenticated`)
      await expect(db!.query(`SELECT title FROM rag_documents`)).rejects.toThrow(/infinite recursion/i)
    } finally {
      await db!.query('ROLLBACK')
    }
  })

  // ---- The backfill ----

  maybe()(
    'backfill derives the workspace from the owner, leaving nothing orphaned',
    async () => {
      // A row whose owner owns workspace A gets workspace A.
      await db!.query(
        `INSERT INTO rag_documents (id, user_id, workspace_id, title, content, category)
       VALUES ('11111111-0000-0000-0000-00000000000f', $1, NULL, 'Backfill me', 'x', 'ref')`,
        [ALICE],
      )
      await new RagWorkspaceScope1786970000000().up({
        query: (sql: string) => db!.query(sql),
      } as never)
      const res = await db!.query(`SELECT workspace_id FROM rag_documents WHERE title = 'Backfill me'`)
      expect(res.rows[0].workspace_id).toBe(WS_A)
      await db!.query(`DELETE FROM rag_documents WHERE title = 'Backfill me'`)
    },
    30_000,
  )
})
