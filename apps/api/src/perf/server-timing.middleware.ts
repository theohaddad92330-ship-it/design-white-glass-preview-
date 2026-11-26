import { Logger } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { performance } from 'perf_hooks'
import { getCorrelationContext } from '../correlation-id/correlation-id.store'
import { currentEventLoopLagP99Ms } from './event-loop-lag'
import { createRequestTiming, formatServerTiming } from './request-timing'

/** Au-delà, la requête est loguée (route, total, requêtes, db, pool) — sans PII. */
export const SLOW_REQUEST_LOG_THRESHOLD_MS = 1000

const logger = new Logger('ServerTiming')

/**
 * La ligne « slow request ». Incident boucle API (05/10/2026) : elle porte
 * `loop=` — le p99 COURANT du retard de la boucle (`EventLoopLagMonitor`) —
 * pour qu'une requête lente parce que la boucle est affamée ne se lise plus
 * comme une base lente. `na` tant que rien n'est mesuré, jamais « 0 ».
 */
export function slowRequestLine(parts: {
  method: string
  route: string
  status: number
  totalMs: number
  queryCount: number
  dbMs: number
  poolWaitMs: number
  loopP99Ms: number | null
}): string {
  const loop = parts.loopP99Ms === null ? 'na' : `${Math.round(parts.loopP99Ms)}ms`
  return (
    `slow request ${parts.method} ${parts.route} status=${parts.status} ` +
    `total=${Math.round(parts.totalMs)}ms queries=${parts.queryCount} ` +
    `db=${Math.round(parts.dbMs)}ms pool=${Math.round(parts.poolWaitMs)}ms loop=${loop}`
  )
}

/** Le motif de route (`/accounts/:id`), jamais l'URL avec ses identifiants. */
function routePattern(req: Request): string {
  const routePath = (req.route as { path?: unknown } | undefined)?.path
  if (typeof routePath !== 'string') return 'unmatched'
  return `${req.baseUrl ?? ''}${routePath}`
}

/**
 * Perf P1 — pose `Server-Timing` et `Timing-Allow-Origin` sur CHAQUE réponse,
 * juste avant l'envoi des en-têtes (`writeHead`), donc aussi pour un flux SSE
 * (les valeurs sont celles de l'instant d'ouverture) ; si les en-têtes sont
 * déjà partis, on ne touche à rien. À monter APRÈS `correlationIdMiddleware`
 * (il porte le contexte) ; `allowedOrigins` = la liste CORS, jamais `*`.
 */
export function createServerTimingMiddleware(allowedOrigins: readonly string[]) {
  const timingAllowOrigin = allowedOrigins.join(', ')

  return function serverTimingMiddleware(req: Request, res: Response, next: NextFunction): void {
    const context = getCorrelationContext()
    if (!context) {
      next()
      return
    }
    const timing = createRequestTiming()
    context.timing = timing

    const originalWriteHead = res.writeHead as (...args: unknown[]) => Response
    res.writeHead = function patchedWriteHead(this: Response, ...args: unknown[]): Response {
      if (!this.headersSent) {
        this.setHeader('Server-Timing', formatServerTiming(timing))
        if (timingAllowOrigin) this.setHeader('Timing-Allow-Origin', timingAllowOrigin)
      }
      return originalWriteHead.apply(this, args)
    } as Response['writeHead']

    res.once('finish', () => {
      const total = performance.now() - timing.startedAt
      if (total <= SLOW_REQUEST_LOG_THRESHOLD_MS) return
      logger.log(
        slowRequestLine({
          method: req.method,
          route: routePattern(req),
          status: res.statusCode,
          totalMs: total,
          queryCount: timing.queryCount,
          dbMs: timing.dbMs,
          poolWaitMs: timing.poolWaitMs,
          loopP99Ms: currentEventLoopLagP99Ms(),
        }),
      )
    })

    next()
  }
}
