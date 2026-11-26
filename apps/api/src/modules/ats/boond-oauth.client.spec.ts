import { createHash } from 'node:crypto'
import type { BoondManagerOAuthApp } from '../zero-layer/boondmanager-config'
import { BoondOAuthClient, newPkcePair } from './boond-oauth.client'

const APP: BoondManagerOAuthApp = {
  clientId: 'app-id',
  clientSecret: 'app-secret',
  redirectUri: 'https://api.example.test/ats/oauth/callback',
  authorizeUrl: 'https://boond.example.test/api/oauth2/authorize',
  tokenUrl: 'https://boond.example.test/api/oauth2/token',
  revokeUrl: 'https://boond.example.test/api/oauth2/revoke',
}

const fetchMock = jest.fn()
const realFetch = global.fetch
beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as never
})
afterAll(() => {
  global.fetch = realFetch
})

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

describe('newPkcePair', () => {
  it('tire un verifier d’au moins 32 octets et un challenge S256 qui en est l’empreinte', () => {
    const { verifier, challenge } = newPkcePair()
    expect(Buffer.from(verifier, 'base64url').length).toBeGreaterThanOrEqual(32)
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
    expect(newPkcePair().verifier).not.toBe(verifier)
  })
})

describe('BoondOAuthClient', () => {
  it('construit une URL d’autorisation avec PKCE S256, state et redirect_uri exacte', () => {
    const url = new URL(new BoondOAuthClient(APP).buildAuthorizeUrl({ state: 's1', codeChallenge: 'c1' }))
    expect(url.origin + url.pathname).toBe(APP.authorizeUrl)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'app-id',
      redirect_uri: APP.redirectUri,
      state: 's1',
      code_challenge: 'c1',
      code_challenge_method: 'S256',
    })
    expect(url.toString()).not.toContain('app-secret')
  })

  it('échange le code : redirect_uri identique, code_verifier envoyé, expires_in du serveur', async () => {
    fetchMock.mockResolvedValue(json(200, { access_token: 'AT', refresh_token: 'RT', expires_in: 4321, scope: 'a b' }))
    const tokens = await new BoondOAuthClient(APP).exchangeCode('the-code', 'the-verifier')
    expect(tokens).toEqual({ accessToken: 'AT', refreshToken: 'RT', expiresIn: 4321, scope: 'a b' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(APP.tokenUrl)
    const body = new URLSearchParams(init.body as string)
    expect(Object.fromEntries(body)).toMatchObject({
      grant_type: 'authorization_code',
      code: 'the-code',
      code_verifier: 'the-verifier',
      redirect_uri: APP.redirectUri,
    })
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('app-id:app-secret').toString('base64')}`)
  })

  it('REFUS : code_verifier absent → rejeté AVANT tout appel réseau', async () => {
    await expect(new BoondOAuthClient(APP).exchangeCode('c', '')).rejects.toThrow(/code_verifier/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ne devine aucune durée : sans expires_in, expiresIn est null', async () => {
    fetchMock.mockResolvedValue(json(200, { access_token: 'AT' }))
    const tokens = await new BoondOAuthClient(APP).exchangeCode('c', 'v')
    expect(tokens.expiresIn).toBeNull()
    expect(tokens.refreshToken).toBeNull()
  })

  it('un client public (sans secret) s’identifie dans le corps, sans en-tête Authorization', async () => {
    fetchMock.mockResolvedValue(json(200, { access_token: 'AT', expires_in: 1 }))
    await new BoondOAuthClient({ ...APP, clientSecret: undefined }).refresh('RT')
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBeUndefined()
    expect(new URLSearchParams(init.body as string).get('client_id')).toBe('app-id')
  })

  it('refresh : grant_type=refresh_token, et le refresh tournant reçu est rendu', async () => {
    fetchMock.mockResolvedValue(json(200, { access_token: 'AT2', refresh_token: 'RT2', expires_in: 10 }))
    const tokens = await new BoondOAuthClient(APP).refresh('RT1')
    expect(tokens.refreshToken).toBe('RT2')
    expect(Object.fromEntries(new URLSearchParams(fetchMock.mock.calls[0][1].body as string))).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'RT1',
    })
  })

  it('une erreur du serveur ne répète JAMAIS un jeton : seulement le statut et le code d’erreur', async () => {
    fetchMock.mockResolvedValue(json(400, { error: 'invalid_grant', error_description: 'RT-SECRET expired' }))
    const error = await new BoondOAuthClient(APP).refresh('RT-SECRET').catch((e: Error) => e)
    expect((error as Error).message).toContain('400')
    expect((error as Error).message).toContain('invalid_grant')
    expect((error as Error).message).not.toContain('RT-SECRET')
  })

  it('révoque via POST sur revocation_endpoint avec le jeton', async () => {
    fetchMock.mockResolvedValue(json(200, {}))
    await new BoondOAuthClient(APP).revoke('RT', 'refresh_token')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(APP.revokeUrl)
    expect(init.method).toBe('POST')
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toMatchObject({
      token: 'RT',
      token_type_hint: 'refresh_token',
    })
  })
})
