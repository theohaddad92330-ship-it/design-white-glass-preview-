import { createParamDecorator, type ExecutionContext } from '@nestjs/common'

export type CurrentUserPayload = {
  userId: string
  email: string
}

/**
 * Extracts the authenticated user from the request — populated by `JwtStrategy`
 * after a successful JWT validation. Use on handlers guarded by `JwtGuard`.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
  const request = ctx.switchToHttp().getRequest()
  return request.user as CurrentUserPayload
})
