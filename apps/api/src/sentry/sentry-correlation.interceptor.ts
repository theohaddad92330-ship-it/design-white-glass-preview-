import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import * as Sentry from '@sentry/nestjs'
import { Request } from 'express'
import { Observable } from 'rxjs'
import { CorrelationIdService } from '../correlation-id/correlation-id.service'

/**
 * Attach correlation-id and authenticated user to the per-request Sentry scope.
 *
 * `@sentry/nestjs` opens a fresh scope for every HTTP request, so `Sentry.setTag` / `setUser`
 * here only affect the current request — no leakage between requests.
 */
@Injectable()
export class SentryCorrelationInterceptor implements NestInterceptor {
  constructor(private readonly correlationIdService: CorrelationIdService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle()

    const correlationId = this.correlationIdService.getCorrelationId()
    if (correlationId) Sentry.setTag('correlation_id', correlationId)

    const req = context.switchToHttp().getRequest<Request & { user?: { userId?: string; email?: string } }>()
    const user = req.user
    if (user?.userId) Sentry.setUser({ id: user.userId, email: user.email })

    return next.handle()
  }
}
