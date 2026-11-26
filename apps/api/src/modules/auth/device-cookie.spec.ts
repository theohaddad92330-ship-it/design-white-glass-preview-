import type { Request } from 'express'
import { clientIp } from './device-cookie'

const req = (over: Record<string, unknown>) => ({ headers: {}, ...over }) as unknown as Request

describe('clientIp (audit M7)', () => {
  it('ignore X-Forwarded-For fourni par le client : req.ip (déjà résolu par trust proxy) fait foi', () => {
    expect(clientIp(req({ headers: { 'x-forwarded-for': '6.6.6.6' }, ip: '203.0.113.9' }))).toBe('203.0.113.9')
  })
  it('sans req.ip : IP de la socket', () => {
    expect(clientIp(req({ socket: { remoteAddress: '10.0.0.1' } }))).toBe('10.0.0.1')
  })
  it('rien : null', () => {
    expect(clientIp(req({}))).toBeNull()
  })
})
