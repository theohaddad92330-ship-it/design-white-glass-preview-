import type { ConfigService } from '@nestjs/config'

/**
 * OAuth 2.1 Authorization Server configuration for the MCP feature.
 *
 * The whole feature is env-gated on `MCP_PUBLIC_URL`: without it the MCP
 * resource server has no stable identity to bind tokens to, so registration
 * and issuance are refused and the /settings screen shows "bientôt disponible".
 *
 * - issuer  = API_PUBLIC_URL  (the `iss` claim + RFC 8414 `issuer`)
 * - resource/audience = MCP_PUBLIC_URL (the `aud` claim, RFC 8707 binding)
 * - signing key = MCP_OAUTH_SIGNING_KEY, falling back to INTERNAL_API_SECRET
 *   (mirrors the CRM token-key resolution ladder).
 */

/** Scopes a client may request. `mcp:analysis` spends credits and `mcp:act`
 *  takes real-world actions on the rep's behalf (send an email, log to CRM) —
 *  both are surfaced explicitly on the consent screen. */
export const MCP_SCOPES = ['mcp:read', 'mcp:analysis', 'mcp:act'] as const

/** Access tokens are short-lived — the client holds a refresh token. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
/** Authorization codes are single-use and expire fast to bound replay. */
export const AUTH_CODE_TTL_SECONDS = 60
/** Refresh tokens live long; rotation + reuse detection bound the risk. */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

type OAuthConfig = {
  enabled: boolean
  issuer: string
  resource: string
  signingKey: string
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

/** Read + normalise the OAuth config from the environment. `enabled` is false
 *  when `MCP_PUBLIC_URL` is unset (feature no-op). */
export function readOAuthConfig(config: ConfigService): OAuthConfig {
  const mcpPublicUrl = config.get<string>('mcpPublicUrl')?.trim()
  const issuer = trimTrailingSlash(config.get<string>('apiPublicUrl') ?? 'http://localhost:3000')
  const signingKey = config.get<string>('mcpOauthSigningKey')?.trim() || config.get<string>('internalApiSecret') || ''
  return {
    enabled: Boolean(mcpPublicUrl),
    issuer,
    resource: mcpPublicUrl ? trimTrailingSlash(mcpPublicUrl) : '',
    signingKey,
  }
}
