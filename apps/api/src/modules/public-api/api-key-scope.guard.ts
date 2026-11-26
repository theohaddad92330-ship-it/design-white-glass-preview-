import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { PublicApiScope } from '../api-keys/api-key.scopes'
import type { ApiKeyPrincipal } from '../api-keys/api-keys.service'

const API_SCOPE_KEY = 'public_api_required_scope'

/** Declare the scope a `/v1` route needs (`read:accounts` / `read:contacts`). */
export const RequireApiScope = (scope: PublicApiScope): MethodDecorator => SetMetadata(API_SCOPE_KEY, scope)

/**
 * Enforces `@RequireApiScope(...)`. Runs AFTER {@link ApiKeyGuard} (guards in
 * one `@UseGuards` array run left-to-right), so `req.apiKey` is set. Unlike
 * the MCP scope guard there is no unscoped-principal bypass: a missing
 * principal fails closed, and a key without the scope gets 403.
 */
@Injectable()
export class ApiKeyScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PublicApiScope | undefined>(API_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required) return true
    const req = context.switchToHttp().getRequest<{ apiKey?: ApiKeyPrincipal }>()
    const granted = req.apiKey?.scopes
    if (!granted?.includes(required)) {
      throw new ForbiddenException(`This endpoint requires the '${required}' scope`)
    }
    return true
  }
}
