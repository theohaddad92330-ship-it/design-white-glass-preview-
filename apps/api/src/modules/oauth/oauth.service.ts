import { Injectable, Logger } from '@nestjs/common'
import { OAuthClientsService } from './oauth-clients.service'
import { OAuthConsentService, isScopeCovered } from './oauth-consent.service'
import { OAuthGrantsService } from './oauth-grants.service'
import { OAuthTokensService } from './oauth-tokens.service'

/** RFC 6749 error object returned by the token endpoint. */
type OAuthError = { error: string; error_description?: string }

type TokenResponse = {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  scope: string
}

type IntrospectionResult =
  | { active: false }
  | { active: true; sub: string; email: string; scope: string; aud: string; client_id: string; exp: number }

function isError(v: TokenResponse | OAuthError): v is OAuthError {
  return 'error' in v
}

/**
 * The security-critical grant handling for `POST /oauth/token`, plus token
 * introspection for the resource server. Kept off the controller so it's unit
 * testable without HTTP.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name)

  constructor(
    private readonly clients: OAuthClientsService,
    private readonly grants: OAuthGrantsService,
    private readonly consent: OAuthConsentService,
    private readonly tokens: OAuthTokensService,
  ) {}

  static isError = isError

  /** `grant_type=authorization_code` — validate client, redeem the single-use
   *  code, enforce exact redirect + PKCE, then mint access + refresh tokens. */
  async exchangeAuthorizationCode(input: {
    code: string
    redirectUri: string
    clientId: string
    codeVerifier?: string
  }): Promise<TokenResponse | OAuthError> {
    const client = await this.clients.findByClientId(input.clientId)
    if (!client) return { error: 'invalid_client', error_description: 'Unknown client_id' }
    if (!input.code) return { error: 'invalid_request', error_description: 'code is required' }
    if (!input.codeVerifier) return { error: 'invalid_request', error_description: 'code_verifier is required' }

    const redeemed = await this.grants.consumeAuthorizationCode(input.code)
    if (!redeemed) return { error: 'invalid_grant', error_description: 'Authorization code is invalid or expired' }
    if (redeemed.client_id !== input.clientId) return { error: 'invalid_grant', error_description: 'client mismatch' }
    if (redeemed.redirect_uri !== input.redirectUri) {
      return { error: 'invalid_grant', error_description: 'redirect_uri mismatch' }
    }
    if (!this.tokens.verifyPkceS256(input.codeVerifier, redeemed.code_challenge)) {
      return { error: 'invalid_grant', error_description: 'PKCE verification failed' }
    }

    return this.issueTokenPair({
      userId: redeemed.user_id,
      clientId: input.clientId,
      scope: redeemed.scope,
      resource: redeemed.resource,
    })
  }

  /** `grant_type=refresh_token` — rotate (reuse → family revoke), optionally
   *  narrow scope, then mint a fresh access + refresh pair. */
  async exchangeRefreshToken(input: {
    refreshToken: string
    clientId: string
    scope?: string
  }): Promise<TokenResponse | OAuthError> {
    const client = await this.clients.findByClientId(input.clientId)
    if (!client) return { error: 'invalid_client', error_description: 'Unknown client_id' }
    if (!input.refreshToken) return { error: 'invalid_request', error_description: 'refresh_token is required' }

    const rotated = await this.grants.rotateRefreshToken(input.refreshToken)
    if (rotated.status !== 'ok') {
      return { error: 'invalid_grant', error_description: `refresh token ${rotated.status}` }
    }
    if (rotated.clientId !== input.clientId) {
      return { error: 'invalid_grant', error_description: 'client mismatch' }
    }
    // Optional down-scoping: requested scope must be a subset of the granted set.
    let scope = rotated.scope
    if (input.scope) {
      if (!isScopeCovered(rotated.scope, input.scope)) {
        return { error: 'invalid_scope', error_description: 'requested scope exceeds the grant' }
      }
      scope = input.scope
    }

    const access = this.tokens.mintAccessToken({ userId: rotated.userId, email: '', clientId: input.clientId, scope })
    await this.clients.touchLastUsed(input.clientId)
    return {
      access_token: access.token,
      token_type: 'Bearer',
      expires_in: access.expiresIn,
      // rotateRefreshToken already issued the successor token.
      refresh_token: rotated.token,
      scope,
    }
  }

  private async issueTokenPair(input: {
    userId: string
    clientId: string
    scope: string
    resource: string | null
  }): Promise<TokenResponse> {
    const access = this.tokens.mintAccessToken({
      userId: input.userId,
      email: '',
      clientId: input.clientId,
      scope: input.scope,
    })
    const refresh = await this.grants.issueRefreshToken({
      userId: input.userId,
      clientId: input.clientId,
      scope: input.scope,
      resource: input.resource,
    })
    await this.clients.touchLastUsed(input.clientId)
    return {
      access_token: access.token,
      token_type: 'Bearer',
      expires_in: access.expiresIn,
      refresh_token: refresh.raw,
      scope: input.scope,
    }
  }

  /**
   * Introspect an access token for the resource server. Verifies signature +
   * audience + expiry AND that the user→client grant is still active — so a
   * user revoking the app in /settings takes effect immediately (bounded only
   * by the RS's short introspection cache).
   */
  async introspect(token: string): Promise<IntrospectionResult> {
    if (!token) return { active: false }
    let payload
    try {
      payload = this.tokens.verifyAccessToken(token)
    } catch {
      return { active: false }
    }
    const stillAuthorized = await this.consent.isAuthorized(payload.sub, payload.client_id)
    if (!stillAuthorized) return { active: false }
    return {
      active: true,
      sub: payload.sub,
      email: payload.email ?? '',
      scope: payload.scope,
      aud: payload.aud,
      client_id: payload.client_id,
      exp: payload.exp,
    }
  }
}
