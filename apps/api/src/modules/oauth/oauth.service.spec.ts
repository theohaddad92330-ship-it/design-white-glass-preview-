import { OAuthService } from './oauth.service'
import type { OAuthClientsService } from './oauth-clients.service'
import type { OAuthConsentService } from './oauth-consent.service'
import type { OAuthGrantsService } from './oauth-grants.service'
import type { OAuthTokensService } from './oauth-tokens.service'

type Mocks = {
  clients: jest.Mocked<Pick<OAuthClientsService, 'findByClientId' | 'touchLastUsed'>>
  grants: jest.Mocked<Pick<OAuthGrantsService, 'consumeAuthorizationCode' | 'issueRefreshToken' | 'rotateRefreshToken'>>
  consent: jest.Mocked<Pick<OAuthConsentService, 'isAuthorized'>>
  tokens: jest.Mocked<Pick<OAuthTokensService, 'verifyPkceS256' | 'mintAccessToken' | 'verifyAccessToken'>>
}

function build(): { svc: OAuthService; m: Mocks } {
  const m: Mocks = {
    clients: { findByClientId: jest.fn(), touchLastUsed: jest.fn() },
    grants: { consumeAuthorizationCode: jest.fn(), issueRefreshToken: jest.fn(), rotateRefreshToken: jest.fn() },
    consent: { isAuthorized: jest.fn() },
    tokens: { verifyPkceS256: jest.fn(), mintAccessToken: jest.fn(), verifyAccessToken: jest.fn() },
  }
  const svc = new OAuthService(
    m.clients as unknown as OAuthClientsService,
    m.grants as unknown as OAuthGrantsService,
    m.consent as unknown as OAuthConsentService,
    m.tokens as unknown as OAuthTokensService,
  )
  return { svc, m }
}

const REDEEMED = {
  client_id: 'c',
  user_id: 'u',
  redirect_uri: 'https://c/cb',
  scope: 'mcp:read',
  resource: 'https://mcp',
  code_challenge: 'chal',
  code_challenge_method: 'S256',
}

describe('OAuthService.exchangeAuthorizationCode', () => {
  it('issues tokens on a valid exchange', async () => {
    const { svc, m } = build()
    m.clients.findByClientId.mockResolvedValue({ client_id: 'c' } as never)
    m.grants.consumeAuthorizationCode.mockResolvedValue(REDEEMED)
    m.tokens.verifyPkceS256.mockReturnValue(true)
    m.tokens.mintAccessToken.mockReturnValue({ token: 'access.jwt', expiresIn: 900, jti: 'j' })
    m.grants.issueRefreshToken.mockResolvedValue({ raw: 'refresh-raw', id: 'r', familyId: 'f', expiresAt: new Date() })

    const res = await svc.exchangeAuthorizationCode({
      code: 'x',
      redirectUri: 'https://c/cb',
      clientId: 'c',
      codeVerifier: 'v',
    })
    expect(OAuthService.isError(res)).toBe(false)
    if (!OAuthService.isError(res)) {
      expect(res.access_token).toBe('access.jwt')
      expect(res.refresh_token).toBe('refresh-raw')
      expect(res.token_type).toBe('Bearer')
      expect(res.scope).toBe('mcp:read')
    }
  })

  it('rejects an unknown client', async () => {
    const { svc, m } = build()
    m.clients.findByClientId.mockResolvedValue(null)
    const res = await svc.exchangeAuthorizationCode({ code: 'x', redirectUri: 'r', clientId: 'c', codeVerifier: 'v' })
    expect(res).toEqual(expect.objectContaining({ error: 'invalid_client' }))
  })

  it('rejects an invalid/expired code', async () => {
    const { svc, m } = build()
    m.clients.findByClientId.mockResolvedValue({ client_id: 'c' } as never)
    m.grants.consumeAuthorizationCode.mockResolvedValue(null)
    const res = await svc.exchangeAuthorizationCode({ code: 'x', redirectUri: 'r', clientId: 'c', codeVerifier: 'v' })
    expect(res).toEqual(expect.objectContaining({ error: 'invalid_grant' }))
  })

  it('rejects a redirect_uri mismatch', async () => {
    const { svc, m } = build()
    m.clients.findByClientId.mockResolvedValue({ client_id: 'c' } as never)
    m.grants.consumeAuthorizationCode.mockResolvedValue(REDEEMED)
    const res = await svc.exchangeAuthorizationCode({
      code: 'x',
      redirectUri: 'https://evil/cb',
      clientId: 'c',
      codeVerifier: 'v',
    })
    expect(res).toEqual(expect.objectContaining({ error: 'invalid_grant' }))
  })

  it('rejects a failed PKCE verification', async () => {
    const { svc, m } = build()
    m.clients.findByClientId.mockResolvedValue({ client_id: 'c' } as never)
    m.grants.consumeAuthorizationCode.mockResolvedValue(REDEEMED)
    m.tokens.verifyPkceS256.mockReturnValue(false)
    const res = await svc.exchangeAuthorizationCode({
      code: 'x',
      redirectUri: 'https://c/cb',
      clientId: 'c',
      codeVerifier: 'bad',
    })
    expect(res).toEqual(expect.objectContaining({ error: 'invalid_grant' }))
  })

  it('requires a code_verifier (PKCE mandatory)', async () => {
    const { svc, m } = build()
    m.clients.findByClientId.mockResolvedValue({ client_id: 'c' } as never)
    const res = await svc.exchangeAuthorizationCode({ code: 'x', redirectUri: 'https://c/cb', clientId: 'c' })
    expect(res).toEqual(expect.objectContaining({ error: 'invalid_request' }))
  })
})

describe('OAuthService.exchangeRefreshToken', () => {
  it('rotates and issues a fresh pair', async () => {
    const { svc, m } = build()
    m.clients.findByClientId.mockResolvedValue({ client_id: 'c' } as never)
    m.grants.rotateRefreshToken.mockResolvedValue({
      status: 'ok',
      token: 'new-refresh',
      expiresAt: new Date(),
      userId: 'u',
      clientId: 'c',
      scope: 'mcp:read mcp:analysis',
      resource: 'https://mcp',
    })
    m.tokens.mintAccessToken.mockReturnValue({ token: 'access2', expiresIn: 900, jti: 'j2' })
    const res = await svc.exchangeRefreshToken({ refreshToken: 'old', clientId: 'c' })
    expect(OAuthService.isError(res)).toBe(false)
    if (!OAuthService.isError(res)) {
      expect(res.refresh_token).toBe('new-refresh')
      expect(res.access_token).toBe('access2')
    }
  })

  it('rejects reuse/invalid refresh tokens', async () => {
    const { svc, m } = build()
    m.clients.findByClientId.mockResolvedValue({ client_id: 'c' } as never)
    m.grants.rotateRefreshToken.mockResolvedValue({ status: 'reuse_detected' })
    const res = await svc.exchangeRefreshToken({ refreshToken: 'old', clientId: 'c' })
    expect(res).toEqual(expect.objectContaining({ error: 'invalid_grant' }))
  })

  it('rejects a client mismatch', async () => {
    const { svc, m } = build()
    m.clients.findByClientId.mockResolvedValue({ client_id: 'c' } as never)
    m.grants.rotateRefreshToken.mockResolvedValue({
      status: 'ok',
      token: 't',
      expiresAt: new Date(),
      userId: 'u',
      clientId: 'other',
      scope: 'mcp:read',
      resource: null,
    })
    const res = await svc.exchangeRefreshToken({ refreshToken: 'old', clientId: 'c' })
    expect(res).toEqual(expect.objectContaining({ error: 'invalid_grant' }))
  })

  it('rejects down-scoping beyond the grant', async () => {
    const { svc, m } = build()
    m.clients.findByClientId.mockResolvedValue({ client_id: 'c' } as never)
    m.grants.rotateRefreshToken.mockResolvedValue({
      status: 'ok',
      token: 't',
      expiresAt: new Date(),
      userId: 'u',
      clientId: 'c',
      scope: 'mcp:read',
      resource: null,
    })
    const res = await svc.exchangeRefreshToken({ refreshToken: 'old', clientId: 'c', scope: 'mcp:read mcp:analysis' })
    expect(res).toEqual(expect.objectContaining({ error: 'invalid_scope' }))
  })
})

describe('OAuthService.introspect', () => {
  const payload = {
    sub: 'u',
    email: 'e@x.fr',
    scope: 'mcp:read',
    aud: 'https://mcp',
    client_id: 'c',
    exp: 9999999999,
    iss: 'https://api',
    jti: 'j',
    iat: 1,
  }

  it('reports active for a valid, still-authorized token', async () => {
    const { svc, m } = build()
    m.tokens.verifyAccessToken.mockReturnValue(payload)
    m.consent.isAuthorized.mockResolvedValue(true)
    const res = await svc.introspect('tok')
    expect(res).toEqual(expect.objectContaining({ active: true, sub: 'u', client_id: 'c' }))
  })

  it('reports inactive when the grant was revoked', async () => {
    const { svc, m } = build()
    m.tokens.verifyAccessToken.mockReturnValue(payload)
    m.consent.isAuthorized.mockResolvedValue(false)
    expect(await svc.introspect('tok')).toEqual({ active: false })
  })

  it('reports inactive for an invalid token', async () => {
    const { svc, m } = build()
    m.tokens.verifyAccessToken.mockImplementation(() => {
      throw new Error('bad')
    })
    expect(await svc.introspect('tok')).toEqual({ active: false })
  })
})
