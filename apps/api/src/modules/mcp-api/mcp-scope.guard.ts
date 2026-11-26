import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

export const MCP_SCOPE_KEY = 'mcp_required_scope'

/** Mark a route as requiring a specific MCP scope (only enforced for tokens
 *  that carry scopes — i.e. MCP OAuth, not a full browser session). */
export const RequireMcpScope = (scope: string): MethodDecorator => SetMetadata(MCP_SCOPE_KEY, scope)

type AuthedRequest = {
  user?: {
    scope?: string
  }
}

/**
 * Enforces the `@RequireMcpScope(...)` marker. A browser session principal has
 * no `scope` field → full access (unchanged behaviour). An MCP OAuth principal
 * must carry the required scope in its granted set, else 403.
 *
 * POSITIVE marker, not a value-level guess: `req.user` is set by exactly one of
 * two Passport strategies behind `ApiAuthGuard` (`['jwt', 'mcp-oauth']`):
 *   - `JwtStrategy#validate` (../auth/jwt.strategy.ts) — Supabase browser
 *     session — returns `{ userId, email }` and NEVER puts a `scope` key on it.
 *   - `McpOAuthStrategy#validate` (./mcp-oauth.strategy.ts) — MCP OAuth token —
 *     returns `{ userId, email, scope }`; its TS return type makes `scope` a
 *     REQUIRED field, so the key is always OWNED by the object it returns, even
 *     when the token carries no `scope` claim at all (`payload.scope || ''`
 *     still assigns an empty string under that key).
 * We test KEY PRESENCE (`'scope' in user`), never `=== undefined`. The previous
 * check inferred "browser session" from "scope is undefined" — which was only
 * safe by accident, because the MCP strategy happens to normalise a missing
 * claim to `''`, a value-level detail that lives OUTSIDE this guard. Had that
 * normalisation ever been dropped (e.g. `scope: payload.scope` without the
 * `|| ''`), a scope-less MCP token would have produced `scope === undefined`
 * and slipped through as if it were a browser session: fail-OPEN. Checking the
 * key's presence is robust to that — an object literal that declares `scope`
 * (even with value `undefined`) still owns the key, so `in` still finds it.
 */
@Injectable()
export class McpScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string | undefined>(MCP_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required) return true
    const req = context.switchToHttp().getRequest<AuthedRequest>()
    const user = req.user
    // No principal at all never happens here in practice — ApiAuthGuard runs
    // first in the same @UseGuards array and would already have thrown 401 for
    // an unauthenticated request. With nothing to prove this IS a browser
    // session, fail closed rather than guess.
    if (!user) {
      throw new ForbiddenException(`This action requires the '${required}' scope`)
    }
    const isMcpPrincipal = 'scope' in user
    if (!isMcpPrincipal) return true // proven browser session (JwtStrategy) → unchanged full access
    const granted = (user.scope ?? '').split(/\s+/).filter(Boolean)
    if (!granted.includes(required)) {
      throw new ForbiddenException(`This action requires the '${required}' scope`)
    }
    return true
  }
}
