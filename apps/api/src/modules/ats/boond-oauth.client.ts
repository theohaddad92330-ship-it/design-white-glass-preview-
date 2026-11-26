import { createHash, randomBytes } from 'node:crypto'
import type { BoondManagerOAuthApp } from '../zero-layer/boondmanager-config'

/**
 * Le client OAuth2 de BoondManager (#4688) : authorization_code + PKCE S256, refresh, révocation.
 *
 * Les points d'accès viennent des métadonnées RFC 8414 publiques de l'éditeur. Ce que l'éditeur ne publie PAS — durée de
 * vie des jetons, refresh tournant ou non — n'est jamais supposé ici : l'expiration est le `expires_in` RENDU, et le
 * refresh token reçu est rendu à l'appelant pour être réécrit à chaque échange.
 *
 * Aucun message d'erreur ne reprend le corps de la réponse : seulement le statut et le code d'erreur OAuth (`invalid_grant`…).
 */

const REQUEST_TIMEOUT_MS = 8000

export type BoondTokens = {
  accessToken: string
  /** `null` : le serveur n'en a pas rendu — l'appelant garde l'ancien, il n'en invente pas. */
  refreshToken: string | null
  /** Secondes, telles que rendues. `null` = non rendu : aucune durée n'est devinée. */
  expiresIn: number | null
  scope: string | null
}

/** Un `code_verifier` d'au moins 32 octets aléatoires, et son `code_challenge` S256. */
export function newPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

export class BoondOAuthClient {
  constructor(private readonly app: BoondManagerOAuthApp) {}

  buildAuthorizeUrl(input: { state: string; codeChallenge: string }): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.app.clientId,
      redirect_uri: this.app.redirectUri,
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
    })
    return `${this.app.authorizeUrl}?${params.toString()}`
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<BoondTokens> {
    // PKCE n'est pas optionnel : sans verifier, on ne tente même pas l'échange.
    if (!codeVerifier) throw new Error('Boond OAuth: code_verifier manquant, échange refusé')
    return this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: this.app.redirectUri,
    })
  }

  async refresh(refreshToken: string): Promise<BoondTokens> {
    return this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })
  }

  async revoke(token: string, hint: 'access_token' | 'refresh_token'): Promise<void> {
    const res = await this.post(this.app.revokeUrl, { token, token_type_hint: hint })
    if (!res.ok) throw new Error(`Boond OAuth revoke: HTTP ${res.status}`)
  }

  private async tokenRequest(form: Record<string, string>): Promise<BoondTokens> {
    const res = await this.post(this.app.tokenUrl, form)
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok) {
      const code =
        typeof data?.['error'] === 'string' && /^[a-z_]{1,64}$/.test(data['error']) ? data['error'] : 'unknown'
      throw new Error(`Boond OAuth token endpoint: HTTP ${res.status} (${code})`)
    }
    const accessToken = data?.['access_token']
    if (typeof accessToken !== 'string' || !accessToken)
      throw new Error('Boond OAuth token endpoint: pas de jeton d’accès')
    const expiresIn = Number(data?.['expires_in'])
    return {
      accessToken,
      refreshToken: typeof data?.['refresh_token'] === 'string' && data['refresh_token'] ? data['refresh_token'] : null,
      expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : null,
      scope: typeof data?.['scope'] === 'string' && data['scope'] ? data['scope'] : null,
    }
  }

  private async post(url: string, form: Record<string, string>): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    }
    const body = new URLSearchParams(form)
    if (this.app.clientSecret) {
      headers['Authorization'] =
        `Basic ${Buffer.from(`${this.app.clientId}:${this.app.clientSecret}`).toString('base64')}`
    } else {
      body.set('client_id', this.app.clientId)
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      return await fetch(url, { method: 'POST', headers, body: body.toString(), signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }
}
