import { InvalidTokenError, ServerError } from '@modelcontextprotocol/sdk/server/auth/errors.js'
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import type { McpEnv } from './config/env.js'

type IntrospectionResponse = {
  active: boolean
  sub?: string
  email?: string
  scope?: string
  aud?: string
  client_id?: string
  exp?: number
}

/** Positive introspection results are cached briefly to spare the API a round
 *  trip on every tool call, while keeping revocation near-real-time. */
const CACHE_TTL_MS = 45_000

/**
 * The Resource Server's token verifier. It holds NO signing key: it asks the
 * Bellum API's internal `POST /oauth/introspect` whether the token is live AND
 * still authorized (the API also checks the user hasn't revoked the app). This
 * is what makes revocation take effect within one cache window.
 */
export function createTokenVerifier(env: McpEnv): OAuthTokenVerifier {
  const cache = new Map<string, { info: AuthInfo; expiresAtMs: number }>()

  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const now = Date.now()
      const cached = cache.get(token)
      if (cached && cached.expiresAtMs > now) return cached.info

      const res = await fetch(`${env.API_INTERNAL_URL}/oauth/introspect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': env.INTERNAL_API_SECRET },
        body: JSON.stringify({ token }),
      })
      // An introspection outage is OUR problem, not the client's token → 500.
      if (!res.ok) throw new ServerError(`Token introspection failed (${res.status})`)
      const data = (await res.json()) as IntrospectionResponse
      if (!data.active) {
        cache.delete(token)
        // Inactive/revoked/expired/forged → 401 so the client re-runs OAuth.
        throw new InvalidTokenError('Token is inactive or has been revoked')
      }

      const info: AuthInfo = {
        token,
        clientId: data.client_id ?? '',
        scopes: (data.scope ?? '').split(/\s+/).filter(Boolean),
        expiresAt: data.exp,
        extra: { sub: data.sub, email: data.email ?? '' },
      }
      const ttl = data.exp ? Math.min(CACHE_TTL_MS, data.exp * 1000 - now) : CACHE_TTL_MS
      if (ttl > 0) cache.set(token, { info, expiresAtMs: now + ttl })
      return info
    },
  }
}
