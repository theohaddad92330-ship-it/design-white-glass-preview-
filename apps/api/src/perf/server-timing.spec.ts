import express, { type Express } from 'express'
import request from 'supertest'
import { correlationIdMiddleware } from '../correlation-id/correlation-id.middleware'
import { countQueries } from './count-queries'
import { instrumentPool } from './pool-instrumentation'
import { formatServerTiming } from './request-timing'
import { createServerTimingMiddleware, slowRequestLine } from './server-timing.middleware'

const ORIGINS = ['https://app.bellum-ai.com', 'https://bellum-ai.com']

/** Faux `pg.Pool` : `connect()` en promesse ou en callback, `query()` en callback. */
function fakePool() {
  const client = {
    query: (_text: unknown, _params: unknown, cb: (err: null, res: { rows: unknown[] }) => void) => {
      setTimeout(() => cb(null, { rows: [] }), 2)
    },
  }
  return {
    client,
    connect(cb?: (err: null, c: typeof client, release: () => void) => void): Promise<typeof client> | void {
      if (cb) return void setTimeout(() => cb(null, client, () => undefined), 1)
      return new Promise(resolve => setTimeout(() => resolve(client), 1))
    },
  }
}

function query(pool: ReturnType<typeof fakePool>, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    void pool.connect((err, client) => {
      if (err) return reject(err)
      client.query(text, [], () => resolve())
    })
  })
}

function buildApp(pool: ReturnType<typeof fakePool>, queriesPerCall: number[]): Express {
  const app = express()
  app.use(correlationIdMiddleware)
  app.use(createServerTimingMiddleware(ORIGINS))
  app.get('/n/:count', async (req, res) => {
    const count = Number(req.params['count'])
    queriesPerCall.push(count)
    for (let i = 0; i < count; i++) await query(pool, 'SELECT secret_column FROM t')
    res.json({ ok: true })
  })
  return app
}

describe('Server-Timing (perf P1)', () => {
  // Incident boucle API (05/10/2026) — la ligne « slow request » porte le
  // retard de la boucle : une requête lente PAR boucle affamée ne se lit plus
  // comme une base lente.
  it('la ligne « slow request » porte le retard courant de la boucle (`loop=`)', () => {
    const line = slowRequestLine({
      method: 'GET',
      route: '/version',
      status: 200,
      totalMs: 2300.4,
      queryCount: 0,
      dbMs: 0,
      poolWaitMs: 0,
      loopP99Ms: 1860.2,
    })
    expect(line).toBe('slow request GET /version status=200 total=2300ms queries=0 db=0ms pool=0ms loop=1860ms')
    // Pas encore mesuré : « na », jamais un « 0 ms » qui ferait croire à une boucle fluide.
    const unmeasured = { method: 'GET', route: '/x', status: 200, totalMs: 1200, queryCount: 1, dbMs: 3, poolWaitMs: 0 }
    expect(slowRequestLine({ ...unmeasured, loopP99Ms: null })).toMatch(/ loop=na$/)
  })

  it('pose un en-tête au bon format sur chaque réponse', async () => {
    const pool = fakePool()
    instrumentPool(pool)
    const res = await request(buildApp(pool, [])).get('/n/2')
    expect(res.headers['server-timing']).toMatch(
      /^app;dur=\d+(\.\d)?, db;dur=\d+(\.\d)?;desc="2 q", pool;dur=\d+(\.\d)?$/,
    )
  })

  it('compte juste sur trois requêtes HTTP successives, sans texte SQL', async () => {
    const pool = fakePool()
    instrumentPool(pool)
    const app = buildApp(pool, [])
    const counts: string[] = []
    for (const n of [0, 1, 4]) {
      const res = await request(app).get(`/n/${n}`)
      counts.push(/desc="(\d+) q"/.exec(String(res.headers['server-timing']))?.[1] ?? '?')
      expect(String(res.headers['server-timing'])).not.toMatch(/select|secret_column/i)
    }
    expect(counts).toEqual(['0', '1', '4'])
  })

  it("mesure l'attente du pool (connect → obtenu)", async () => {
    const pool = fakePool()
    instrumentPool(pool)
    const { queries, poolWaitMs, dbMs } = await countQueries(() => query(pool, 'SELECT 1'))
    expect(queries).toBe(1)
    expect(poolWaitMs).toBeGreaterThan(0)
    expect(dbMs).toBeGreaterThan(0)
  })

  it('ignore le cadrage de transaction et ne double pas un pool déjà enveloppé', async () => {
    const pool = fakePool()
    instrumentPool(pool)
    instrumentPool(pool)
    const { queries } = await countQueries(async () => {
      await query(pool, 'START TRANSACTION')
      await query(pool, 'UPDATE t SET a = 1')
      await query(pool, 'COMMIT')
    })
    expect(queries).toBe(1)
  })

  it('formatServerTiming arrondit à 0,1 ms', () => {
    const header = formatServerTiming({ startedAt: 0, queryCount: 3, dbMs: 4.44, poolWaitMs: 0.06 }, 12.34)
    expect(header).toBe('app;dur=12.3, db;dur=4.4;desc="3 q", pool;dur=0.1')
  })

  it('ne casse pas une réponse dont les en-têtes sont déjà partis (flux)', async () => {
    const app = express()
    app.use(correlationIdMiddleware)
    app.use(createServerTimingMiddleware(ORIGINS))
    app.get('/stream', (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write('data: 1\n\n')
      res.end('data: 2\n\n')
    })
    const res = await request(app)
      .get('/stream')
      .buffer(true)
      .parse((r, cb) => {
        let body = ''
        r.on('data', (c: Buffer) => (body += c.toString()))
        r.on('end', () => cb(null, body))
      })
    expect(res.status).toBe(200)
    expect(res.headers['server-timing']).toContain('app;dur=')
  })
})

describe('Timing-Allow-Origin (perf P1)', () => {
  it('liste les origines CORS autorisées, jamais *', async () => {
    const res = await request(buildApp(fakePool(), [])).get('/n/0')
    expect(res.headers['timing-allow-origin']).toBe('https://app.bellum-ai.com, https://bellum-ai.com')
    expect(res.headers['timing-allow-origin']).not.toContain('*')
  })

  it("n'est pas posé quand aucune origine n'est autorisée", async () => {
    const app = express()
    app.use(correlationIdMiddleware)
    app.use(createServerTimingMiddleware([]))
    app.get('/x', (_req, res) => void res.json({}))
    const res = await request(app).get('/x')
    expect(res.headers['timing-allow-origin']).toBeUndefined()
    expect(res.headers['server-timing']).toBeDefined()
  })
})
