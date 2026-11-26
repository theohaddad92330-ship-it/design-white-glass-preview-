import type { Request, Response } from 'express'
import { stashResendRawBody } from './resend-raw-body.middleware'

// #2733 — copié du patron `stripe-raw-body.middleware.spec.ts` : même besoin
// (les octets EXACTS que le fournisseur a signés), même garantie testée.
describe('stashResendRawBody', () => {
  const run = (body: unknown) => {
    const req = { body } as unknown as Request & { rawBody?: Buffer }
    const next = jest.fn()
    stashResendRawBody(req, {} as Response, next)
    return { req, next }
  }

  it('copie le buffer brut sur req.rawBody — la vérification voit les octets exacts', () => {
    const raw = Buffer.from(JSON.stringify({ type: 'email.bounced' }))
    const { req, next } = run(raw)
    expect(req.rawBody).toBe(raw)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("laisse rawBody indéfini quand le corps n'est pas un buffer (jamais d'octets inventés)", () => {
    const { req, next } = run({ type: 'email.bounced' })
    expect(req.rawBody).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
  })
})
