import { describe, expect, it } from 'vitest'
import { resolveOauthReturnTo } from './oauth-return-to'

const API = 'https://api.bellum-ai.com'
const RAILWAY = 'https://belllum-backend-service-production.up.railway.app'
const AUTHORIZE = '/oauth/authorize?client_id=c1&response_type=code&state=s'

describe('resolveOauthReturnTo — le retour vers l’autorisation OAuth MCP', () => {
  it('garde une URL déjà sur l’origine publique de l’API', () => {
    expect(resolveOauthReturnTo(`${API}${AUTHORIZE}`, API, null)).toBe(`${API}${AUTHORIZE}`)
  })

  it('ramène l’hôte issuer (Railway) sur l’origine de l’API : le cookie de session n’existe que là', () => {
    expect(resolveOauthReturnTo(`${RAILWAY}${AUTHORIZE}`, API, RAILWAY)).toBe(`${API}${AUTHORIZE}`)
  })

  it('refuse une origine qui n’est ni l’API ni l’issuer — jamais une redirection ouverte', () => {
    expect(resolveOauthReturnTo(`https://evil.example${AUTHORIZE}`, API, RAILWAY)).toBeNull()
    expect(resolveOauthReturnTo(`https://evil.example${AUTHORIZE}`, API, null)).toBeNull()
  })

  it('refuse l’issuer tant qu’il n’est pas connu', () => {
    expect(resolveOauthReturnTo(`${RAILWAY}${AUTHORIZE}`, API, null)).toBeNull()
  })

  it('refuse un chemin qui n’est pas /oauth/authorize, même sur une origine permise', () => {
    expect(resolveOauthReturnTo(`${API}/accounts`, API, RAILWAY)).toBeNull()
    expect(resolveOauthReturnTo(`${RAILWAY}/v1/anything`, API, RAILWAY)).toBeNull()
  })

  it('refuse une valeur illisible ou vide', () => {
    expect(resolveOauthReturnTo('not a url', API, RAILWAY)).toBeNull()
    expect(resolveOauthReturnTo('', API, RAILWAY)).toBeNull()
    expect(resolveOauthReturnTo('javascript:alert(1)', API, RAILWAY)).toBeNull()
  })
})
