import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { API_KEY_PREFIX, ApiKeysService, type ApiKeyPrincipal } from '../api-keys/api-keys.service'

/** The request field the guard populates — deliberately NOT `req.user`, so an
 *  API key can never satisfy code that expects a user principal. */
type ApiKeyRequest = Request & { apiKey?: ApiKeyPrincipal }

/**
 * Authenticates `Authorization: Bearer blm_live_…` for the public `/v1`
 * surface. Flow: prefix check (cheap reject of non-key bearers — a Supabase
 * JWT or MCP token never starts with `blm_`) → SHA-256 → active-row lookup.
 *
 * SECURITY:
 *  - opt-in per controller, exactly like `ApiAuthGuard`: an API key is
 *    confined to the routes that mount THIS guard — it can never reach a
 *    `JwtGuard` route (billing, deletion, admin, key management…);
 *  - the raw key is hashed immediately and never stored or logged;
 *  - the principal carries the key's `workspace_id` — every downstream read
 *    scopes on it, so key A can never see workspace B's data;
 *  - revoked/unknown keys get the same 401 (no oracle).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ApiKeyRequest>()
    const header = req.headers.authorization
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('API key required (Authorization: Bearer blm_live_…)')
    }
    const raw = header.slice('Bearer '.length).trim()
    if (!raw.startsWith(API_KEY_PREFIX)) {
      throw new UnauthorizedException('Invalid API key')
    }
    const row = await this.apiKeys.findActiveByRawKey(raw)
    if (!row) {
      throw new UnauthorizedException('Invalid API key')
    }
    req.apiKey = { keyId: row.id, workspaceId: row.workspace_id, scopes: row.scopes ?? [] }
    this.apiKeys.touchLastUsed(row.id)
    return true
  }
}

/** Extracts the authenticated key principal on `ApiKeyGuard`-protected routes. */
export const CurrentApiKey = createParamDecorator((_data: unknown, ctx: ExecutionContext): ApiKeyPrincipal => {
  const request = ctx.switchToHttp().getRequest<ApiKeyRequest>()
  // The guard always sets it; the non-null assertion is confined here.
  return request.apiKey as ApiKeyPrincipal
})
