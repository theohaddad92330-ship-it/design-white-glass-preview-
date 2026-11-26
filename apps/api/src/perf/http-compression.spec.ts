import express from 'express'
import request from 'supertest'
import { httpCompression } from './http-compression'

function build() {
  const app = express()
  app.use(httpCompression())
  const big = { rows: Array.from({ length: 200 }, (_, i) => ({ id: i, label: `ligne numéro ${i}` })) }
  app.get('/json', (_req, res) => void res.json(big))
  app.get('/small', (_req, res) => void res.json({ ok: true }))
  app.get('/sse', (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.write(`data: ${'x'.repeat(4000)}\n\n`)
    res.end()
  })
  return app
}

describe('compression HTTP (perf P1)', () => {
  it('compresse un JSON de plus de 1 Ko', async () => {
    const res = await request(build()).get('/json').set('Accept-Encoding', 'gzip')
    expect(res.headers['content-encoding']).toBe('gzip')
    expect(res.body.rows).toHaveLength(200)
  })

  it('ne compresse pas sous le seuil de 1 Ko', async () => {
    const res = await request(build()).get('/small').set('Accept-Encoding', 'gzip')
    expect(res.headers['content-encoding']).toBeUndefined()
  })

  it('ne compresse JAMAIS un flux text/event-stream', async () => {
    const res = await request(build()).get('/sse').set('Accept-Encoding', 'gzip')
    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.headers['content-encoding']).toBeUndefined()
  })

  it('ne compresse pas le transport Socket.IO', async () => {
    const app = express()
    app.use(httpCompression())
    app.get('/socket.io/', (_req, res) => void res.type('text/plain').send('y'.repeat(5000)))
    const res = await request(app).get('/socket.io/').set('Accept-Encoding', 'gzip')
    expect(res.headers['content-encoding']).toBeUndefined()
  })
})
