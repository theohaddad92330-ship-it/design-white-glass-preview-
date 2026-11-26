import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

/**
 * Like `JwtGuard`, but NEVER rejects: it runs the same Supabase JWT strategy
 * (session cookie first, Bearer fallback) and attaches `req.user` when a valid
 * session is present, otherwise leaves it undefined and lets the request
 * through. The OAuth authorize/consent endpoints need this: an unauthenticated
 * browser must be redirected to login, not 401'd.
 */
@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser | undefined {
    return user || undefined
  }
}
