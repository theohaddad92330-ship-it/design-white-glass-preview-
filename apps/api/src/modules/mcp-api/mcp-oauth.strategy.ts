import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { readOAuthConfig } from '../oauth/oauth-config'

type McpJwtPayload = {
  sub: string
  email?: string
  scope?: string
  client_id?: string
  aud?: string
  iss?: string
}

/**
 * Validates MCP OAuth access tokens (the tokens the AS issues). Bearer-header
 * only — NEVER a cookie, so a browser session can't accidentally satisfy it —
 * HS256 only (blocks alg-confusion / `none`), with issuer + audience pinned to
 * this deployment's values. The `aud` binding (RFC 8707) means a Supabase
 * session token (aud `authenticated`) can't be replayed here and vice-versa.
 *
 * `validate` returns the same `{ userId, email }` shape as the Supabase
 * strategy, so downstream `@CurrentUser()` and workspace resolution are
 * identical whichever credential authenticated the request.
 */
@Injectable()
export class McpOAuthStrategy extends PassportStrategy(Strategy, 'mcp-oauth') {
  constructor(config: ConfigService) {
    const { issuer, resource, signingKey } = readOAuthConfig(config)
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: signingKey || 'mcp-oauth-unconfigured',
      algorithms: ['HS256'],
      issuer,
      // When MCP is disabled there is no resource; an impossible audience makes
      // the strategy fail closed for every token.
      audience: resource || 'urn:bellum:mcp:disabled',
    })
  }

  validate(payload: McpJwtPayload): { userId: string; email: string; scope: string } {
    return { userId: payload.sub, email: payload.email || '', scope: payload.scope || '' }
  }
}
