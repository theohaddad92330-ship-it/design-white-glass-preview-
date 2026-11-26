import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import { pickScopedCookie, readSessionScopeHint } from '../auth/scoped-session-cookie'

const DEFAULT_REFRESH_PREFIX = 'uploadsSig'

/**
 * Extracts the refresh token from the user-scoped `uploadsSig:{userId}`
 * HttpOnly cookie set by the API.
 *
 * Le commentaire d'origine disait « avec plusieurs sessions dans le même
 * navigateur, le premier `uploadsSig:` suffit — /auth/refresh n'a besoin QUE
 * d'un jeton valide pour en émettre une nouvelle paire ». C'est vrai d'un point
 * de vue cryptographique et faux d'un point de vue produit : la paire émise est
 * celle de l'utilisateur du jeton choisi, si bien qu'un rafraîchissement dans
 * l'onglet de démonstration pouvait rendre la session du vrai compte. L'onglet
 * dit maintenant pour QUI il rafraîchit (voir {@link pickScopedCookie}).
 *
 * Returns `null` when no matching refresh cookie is present. Cookie prefix comes
 * from `process.env.REFRESH_COOKIE_PREFIX` to stay in sync with the value used
 * by `AttachRefreshCookieInterceptor`.
 */
export const RefreshCookie = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | null => {
  const request = ctx.switchToHttp().getRequest<{
    cookies?: Record<string, string>
    headers?: Record<string, unknown>
  }>()
  const prefix = process.env['REFRESH_COOKIE_PREFIX'] || DEFAULT_REFRESH_PREFIX
  return pickScopedCookie(request.cookies, prefix, readSessionScopeHint(request.headers))
})
