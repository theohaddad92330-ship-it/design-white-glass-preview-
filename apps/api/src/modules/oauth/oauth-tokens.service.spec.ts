import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { createHash } from 'node:crypto'
import { OAuthTokensService } from './oauth-tokens.service'

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    apiPublicUrl: 'https://api.bellum.test',
    mcpPublicUrl: 'https://mcp.bellum.test',
    mcpOauthSigningKey: 'test-mcp-signing-key-at-least-16-chars',
    internalApiSecret: 'test-internal-secret-fallback-key',
    ...overrides,
  }
  return { get: (key: string) => values[key] } as unknown as ConfigService
}

function makeService(config: ConfigService = makeConfig()): OAuthTokensService {
  return new OAuthTokensService(new JwtService({}), config)
}

describe('OAuthTokensService', () => {
  describe('access token mint + verify', () => {
    it('round-trips claims (sub, aud, iss, scope, client_id, email, jti)', () => {
      const svc = makeService()
      const { token, jti, expiresIn } = svc.mintAccessToken({
        userId: 'user-1',
        email: 'rep@esn.fr',
        clientId: 'client-abc',
        scope: 'mcp:read mcp:analysis',
      })
      expect(expiresIn).toBe(15 * 60)
      const payload = svc.verifyAccessToken(token)
      expect(payload.sub).toBe('user-1')
      expect(payload.email).toBe('rep@esn.fr')
      expect(payload.scope).toBe('mcp:read mcp:analysis')
      expect(payload.client_id).toBe('client-abc')
      expect(payload.iss).toBe('https://api.bellum.test')
      expect(payload.aud).toBe('https://mcp.bellum.test')
      expect(payload.jti).toBe(jti)
      expect(payload.exp).toBeGreaterThan(payload.iat)
    })

    it('rejects a token whose audience does not match this resource', () => {
      const issuer = makeService(makeConfig({ mcpPublicUrl: 'https://mcp.bellum.test' }))
      const { token } = issuer.mintAccessToken({ userId: 'u', email: 'e', clientId: 'c', scope: 'mcp:read' })
      // A verifier configured for a DIFFERENT resource must reject it.
      const other = makeService(makeConfig({ mcpPublicUrl: 'https://evil.example.com' }))
      expect(() => other.verifyAccessToken(token)).toThrow()
    })

    it('rejects a token signed with a different key (tampered signature)', () => {
      const issuer = makeService(makeConfig({ mcpOauthSigningKey: 'key-one-at-least-16-chars-aaaa' }))
      const { token } = issuer.mintAccessToken({ userId: 'u', email: 'e', clientId: 'c', scope: 'mcp:read' })
      const other = makeService(makeConfig({ mcpOauthSigningKey: 'key-two-at-least-16-chars-bbbb' }))
      expect(() => other.verifyAccessToken(token)).toThrow()
    })

    it('falls back to INTERNAL_API_SECRET when no dedicated signing key is set', () => {
      const cfg = makeConfig({ mcpOauthSigningKey: '', internalApiSecret: 'shared-internal-secret-16+chars' })
      const svc = makeService(cfg)
      const { token } = svc.mintAccessToken({ userId: 'u', email: 'e', clientId: 'c', scope: 'mcp:read' })
      expect(svc.verifyAccessToken(token).sub).toBe('u')
    })
  })

  describe('opaque tokens', () => {
    it('generates a high-entropy raw token whose hash matches hashToken', () => {
      const svc = makeService()
      const { raw, hash } = svc.generateOpaqueToken()
      expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/) // 32 bytes base64url
      expect(hash).toHaveLength(64)
      expect(svc.hashToken(raw)).toBe(hash)
    })

    it('produces distinct tokens across calls', () => {
      const svc = makeService()
      expect(svc.generateOpaqueToken().raw).not.toBe(svc.generateOpaqueToken().raw)
    })
  })

  describe('PKCE S256', () => {
    it('accepts a valid verifier/challenge pair', () => {
      const svc = makeService()
      const verifier = 'a'.repeat(64)
      const challenge = createHash('sha256').update(verifier).digest('base64url')
      expect(svc.verifyPkceS256(verifier, challenge)).toBe(true)
    })

    it('rejects a wrong verifier', () => {
      const svc = makeService()
      const challenge = createHash('sha256').update('right-verifier').digest('base64url')
      expect(svc.verifyPkceS256('wrong-verifier', challenge)).toBe(false)
    })

    it('rejects a challenge of mismatched length without throwing', () => {
      const svc = makeService()
      expect(svc.verifyPkceS256('v', 'too-short')).toBe(false)
    })
  })
})
