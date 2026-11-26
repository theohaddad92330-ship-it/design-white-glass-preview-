import { randomUUID } from 'crypto'
import { Request, Response, NextFunction } from 'express'
import {
  correlationStorage,
  CorrelationContext,
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
} from './correlation-id.store'

/**
 * Express middleware that assigns a correlation ID to every request.
 *
 * - Reads X-Correlation-ID or X-Request-ID from incoming headers
 * - Generates a UUID if none is provided
 * - Sets the ID on the response header
 * - Enters AsyncLocalStorage so any downstream code can call getCorrelationId()
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId =
    (req.headers[CORRELATION_ID_HEADER] as string) || (req.headers[REQUEST_ID_HEADER] as string) || randomUUID()

  res.setHeader(CORRELATION_ID_HEADER, correlationId)

  const context: CorrelationContext = {
    correlationId,
    requestPath: req.path,
    requestMethod: req.method,
    // #2442.4 (épopée #2879) — voir le docblock de `receivedAt`.
    receivedAt: Date.now(),
  }

  correlationStorage.run(context, () => {
    next()
  })
}
