import type { Request, Response } from 'express'
import { stashRawBody } from './stripe-raw-body.middleware'

describe('stashRawBody', () => {
  const run = (body: unknown) => {
    const req = { body } as unknown as Request & { rawBody?: Buffer }
    const next = jest.fn()
    stashRawBody(req, {} as Response, next)
    return { req, next }
  }

  it('copies the raw buffer onto req.rawBody so the signature check sees exact bytes', () => {
    const raw = Buffer.from(JSON.stringify({ id: 'evt_1' }))
    const { req, next } = run(raw)
    expect(req.rawBody).toBe(raw)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('leaves rawBody undefined when the body is not a buffer (never fabricates bytes)', () => {
    const { req, next } = run({ id: 'evt_1' })
    expect(req.rawBody).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
  })
})
