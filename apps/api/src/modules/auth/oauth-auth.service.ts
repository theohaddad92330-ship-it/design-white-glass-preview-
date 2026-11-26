import { Injectable } from '@nestjs/common'
import type { SessionResponse } from '@bellum/contracts'
import { failure, success, type Result } from '@bellum/utils'
import { SupabaseAuthGateway } from './supabase-auth.gateway'
import { SessionService } from './session.service'
import type { AuthFailure } from './auth.types'

@Injectable()
export class OAuthService {
  constructor(
    private readonly gateway: SupabaseAuthGateway,
    private readonly sessionService: SessionService,
  ) {}

  async oauthGoogleUrl(): Promise<Result<string, AuthFailure>> {
    const redirectTo = this.gateway.buildRedirectUrl('/auth/callback')
    const { data, error } = await this.gateway.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    })
    if (error || !data.url) {
      return failure({
        code: 'oauth_url_failed',
        message: error?.message || "Impossible de générer l'URL Google OAuth",
      })
    }
    const url: string = this.gateway.appendAnonApiKey(data.url)
    return success(url)
  }

  async oauthCallback(accessToken: string, refreshToken: string): Promise<Result<SessionResponse, AuthFailure>> {
    const { data, error } = await this.gateway.client.auth.getUser(accessToken)
    if (error || !data.user) {
      return failure({ code: 'oauth_tokens_invalid', message: error?.message || 'Tokens OAuth invalides' })
    }

    const sessionResponse: SessionResponse = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: decodeExpiresAt(accessToken),
      user: this.sessionService.mapToSessionUser(data.user),
    }
    return success(sessionResponse)
  }
}

function decodeExpiresAt(jwt: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1] || '', 'base64').toString('utf8'))

    const expiresAt = typeof payload.exp === 'number' ? payload.exp : null
    return expiresAt
  } catch {
    return null
  }
}
