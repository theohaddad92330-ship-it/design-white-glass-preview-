import { ArgumentsHost, Catch, HttpException, Injectable, Logger } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import type { Request } from 'express'
import { DataSource } from 'typeorm'
import { InsufficientRoleException } from './insufficient-role.exception'
import { redactForLog, redactSecrets } from './observability-privacy'

/**
 * Central exception filter: logs every thrown exception with its `cause`
 * chain before delegating response serialization to Nest's default handler.
 *
 * Why here rather than scattered `logger.error` in services:
 *   — services stay pure (return `Result<_, Failure>`, never log)
 *   — 404 / 401 that carry no underlying error stay quiet (expected path)
 *   — 5xx and any exception with a `cause` get the full diagnostic dump
 *   — logs flow through `logger.error` → `SentryWinstonTransport` so Sentry
 *     sees the same chain without duplicate `captureException` calls.
 *
 * Controllers wrap domain failures in `HttpException(..., { cause: originalError })`
 * so the Supabase / IA / Stripe error survives to this filter.
 *
 * Épopée #2879 (#2442.14 / #2442.15) — c'est aussi le SEUL chokepoint mécanique
 * commun à toute l'API pour un « accès refusé » : tout 401/403, quel que soit le
 * contrôleur ou le guard qui l'a levé, traverse ce filtre unique (`APP_FILTER`).
 * Il écrit donc le premier compteur de sécurité du dépôt (`security_events`,
 * lu par `ObservabilityAlertsService`) — voir {@link recordAuthorizationDenied}.
 */
@Catch()
@Injectable()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter')

  constructor(private readonly dataSource: DataSource) {
    super()
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return super.catch(exception, host)

    const req = host.switchToHttp().getRequest<Request>()
    const status = exception instanceof HttpException ? exception.getStatus() : 500
    const cause = exception instanceof Error ? (exception.cause ?? null) : null

    // 5xx are always actionable. 4xx with a `cause` means something internal
    // leaked through (e.g. Supabase 404 masked as NotFoundException) — also log.
    if (status >= 500 || cause) {
      const baseMsg = exception instanceof Error ? exception.message : String(exception)
      const causeLine = cause ? `\n  cause: ${formatCause(cause)}` : ''
      const stack = exception instanceof Error ? exception.stack : undefined

      this.logger.error(`${req.method} ${req.originalUrl} → ${status}: ${baseMsg}${causeLine}`, stack)
    }

    // Épopée #2879 — un accès refusé reste « attendu » (pas de dump ci-dessus),
    // mais il compte désormais pour l'alerte de sécurité.
    if (status === 401 || status === 403) {
      this.recordAuthorizationDenied(
        status,
        req,
        exception instanceof InsufficientRoleException ? 'permission_escalated' : 'authorization_denied',
      )
    }

    super.catch(exception, host)
  }

  /**
   * Best-effort, non-bloquant (même discipline que la persistance d'un tour de
   * chat) : un échec d'écriture ne doit jamais retarder ni faire échouer la
   * réponse d'erreur déjà en cours — la ligne manquée est journalisée en
   * `warn`, jamais en `error` (elle ne doit pas, elle, déclencher Sentry).
   *
   * `path` est la ROUTE seule (`req.route.path`, le motif `/accounts/:id`, pas
   * l'URL résolue) — jamais la requête complète : aucun paramètre, aucun corps,
   * aucune donnée personnelle. Voir la migration `1796322009123`.
   */
  private recordAuthorizationDenied(
    status: number,
    req: Request,
    kind: 'authorization_denied' | 'permission_escalated',
  ): void {
    const routePath = (req as unknown as { route?: { path?: unknown } }).route?.path
    const path = (typeof routePath === 'string' ? routePath : (req.originalUrl.split('?')[0] ?? '')).slice(0, 200)
    this.dataSource
      .query(`INSERT INTO security_events (kind, status_code, path) VALUES ($1, $2, $3)`, [kind, status, path])
      .catch((error: unknown) => {
        this.logger.warn('Compteur de sécurité : accès refusé non enregistré (la réponse part quand même)', {
          error: error instanceof Error ? error.message : String(error),
        })
      })
  }
}

function formatCause(cause: unknown): string {
  if (cause instanceof Error) return `${cause.name}: ${redactSecrets(cause.message)}`
  if (cause && typeof cause === 'object') {
    // #2442.7 — `hint` et `details` viennent de PostgREST : ils citent
    // volontiers la LIGNE qui a échoué (« Key (email)=(jean@…) already
    // exists »). Ils restent utiles au diagnostic, mais passent par le même
    // puits que tout le reste : type, taille, empreinte au lieu du contenu.
    const c = redactForLog(cause) as Record<string, unknown>
    const keys = ['code', 'message', 'hint', 'details', 'status']
    return keys
      .filter(k => c[k] !== undefined)
      .map(k => `${k}=${JSON.stringify(c[k])}`)
      .join(' ')
  }
  return redactSecrets(String(cause))
}
