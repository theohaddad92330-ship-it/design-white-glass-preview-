import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { IMPERSONATION_AUDIENCE } from '../auth/impersonation-config'
import { ImpersonationTokenService } from './impersonation-token.service'

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    internalApiSecret: 'test-internal-secret-at-least-32-chars-long-xyz',
    apiPublicUrl: 'https://api.test.bellum',
    frontendUrl: 'https://app.test.bellum',
    ...overrides,
  }
  return { get: (key: string, def?: unknown) => values[key] ?? def } as unknown as ConfigService
}

describe('ImpersonationTokenService', () => {
  const jwt = new JwtService({})
  const service = new ImpersonationTokenService(jwt, makeConfig())

  it('mints an HS256 token carrying sub (target), act (admin), impersonation:true, aud, jti and a bounded expiry', () => {
    const before = Math.floor(Date.now() / 1000)
    const { token, jti, expiresAt } = service.mint({
      targetUserId: 'target-1',
      targetEmail: 'user@corp.fr',
      impersonatorActor: 'ops@bellum',
    })
    expect(token.split('.')).toHaveLength(3)
    expect(jti).toMatch(/[0-9a-f-]{36}/)

    const decoded = service.verify(token)
    expect(decoded.sub).toBe('target-1')
    expect(decoded.act).toBe('ops@bellum')
    expect(decoded.email).toBe('user@corp.fr')
    expect(decoded.impersonation).toBe(true)
    expect(decoded.aud).toBe(IMPERSONATION_AUDIENCE)
    expect(decoded.jti).toBe(jti)

    // TTL is short (≤ 30 min) — a session cannot be long-lived.
    expect(expiresAt - before).toBeLessThanOrEqual(30 * 60)
    expect(expiresAt - before).toBeGreaterThan(0)
  })

  it('rejects a token signed with a different key (forgery)', () => {
    const forger = new ImpersonationTokenService(
      jwt,
      makeConfig({ internalApiSecret: 'a-totally-different-secret-key-32ch' }),
    )
    const { token } = service.mint({ targetUserId: 't', targetEmail: 'e@e.fr', impersonatorActor: 'ops' })
    expect(() => forger.verify(token)).toThrow()
  })

  it('rejects a token minted for the wrong audience (e.g. an MCP/Supabase token)', () => {
    const alienAudToken = jwt.sign(
      { impersonation: true },
      {
        secret: 'test-internal-secret-at-least-32-chars-long-xyz',
        algorithm: 'HS256',
        subject: 't',
        issuer: 'https://api.test.bellum',
        audience: 'authenticated',
        expiresIn: 300,
      },
    )
    expect(() => service.verify(alienAudToken)).toThrow()
  })

  it('rejects a correctly-signed token that lacks the impersonation flag', () => {
    const noFlag = jwt.sign(
      {},
      {
        secret: 'test-internal-secret-at-least-32-chars-long-xyz',
        algorithm: 'HS256',
        subject: 't',
        issuer: 'https://api.test.bellum',
        audience: IMPERSONATION_AUDIENCE,
        expiresIn: 300,
      },
    )
    expect(() => service.verify(noFlag)).toThrow()
  })
})
