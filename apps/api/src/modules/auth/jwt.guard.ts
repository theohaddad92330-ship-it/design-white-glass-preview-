import { type ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { observeSpan } from '../../common/observability-span'
import { isBlockedDuringImpersonation } from './impersonation-policy'

/**
 * The app-wide authentication guard for user-facing routes.
 *
 * It accepts EITHER a normal Supabase browser session (`jwt`) OR an admin
 * impersonation token (`impersonation`). Passport tries `impersonation` FIRST so
 * an active impersonation cookie deterministically wins over any stale
 * normal-session cookie in the same browser; a request with neither credential
 * still 401s exactly as before.
 *
 * SECURITY: when the request authenticated via an impersonation token, this guard
 * ALSO enforces the least-privilege policy — the session is read-only, so every
 * state-changing request (billing, deletion, workspace/member management, sending
 * email, launching analyses, CRM connect, MFA changes, re-impersonation, …) is
 * rejected with 403. See {@link isBlockedDuringImpersonation}. Because this is the
 * single choke point every `@UseGuards(JwtGuard)` route already uses, the policy
 * applies uniformly with no per-controller wiring.
 */
@Injectable()
export class JwtGuard extends AuthGuard(['impersonation', 'jwt']) {
  /**
   * #2442.4 (épopée #2879) — le span « auth » de TOUTE route utilisateur : ce
   * guard est déjà le seul passage obligé. La décision reste celle de passport,
   * inchangée ; un refus (401/403) se propage tel quel.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    return observeSpan('auth', 'jwt', async () => Boolean(await super.canActivate(context)))
  }

  handleRequest<TUser>(err: Error | null, user: TUser, _info: unknown, context: ExecutionContext): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('Token invalide ou expiré')
    }

    const principal = user as { impersonation?: boolean }
    if (principal?.impersonation === true) {
      const req = context.switchToHttp().getRequest<{ method: string; originalUrl?: string; url?: string }>()
      const path = req.originalUrl ?? req.url ?? ''
      if (isBlockedDuringImpersonation(req.method, path)) {
        throw new ForbiddenException('Action non autorisée en mode incarnation — session en lecture seule.')
      }
    }

    return user
  }
}
