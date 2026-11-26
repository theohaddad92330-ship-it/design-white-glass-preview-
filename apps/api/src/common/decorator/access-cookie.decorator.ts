import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import { pickScopedCookie, readSessionScopeHint } from '../auth/scoped-session-cookie'

const DEFAULT_SESSION_PREFIX = 'session'

/**
 * Extracts the access token from the user-scoped `session:{userId}`
 * HttpOnly cookie. Used by `logout` to forward the live Supabase access
 * token to `supabase.auth.admin.signOut(jwt)` for server-side
 * revocation. Returns `null` when no session cookie is present.
 *
 * Scopé par l'identité que l'onglet déclare (voir {@link pickScopedCookie}) :
 * quitter la démonstration ne doit pas révoquer la session du vrai compte
 * ouverte dans l'onglet d'à côté.
 */
export const AccessCookie = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | null => {
  const request = ctx.switchToHttp().getRequest<{
    cookies?: Record<string, string>
    headers?: Record<string, unknown>
  }>()
  const prefix = process.env['SESSION_COOKIE_PREFIX'] || DEFAULT_SESSION_PREFIX
  return pickScopedCookie(request.cookies, prefix, readSessionScopeHint(request.headers))
})
