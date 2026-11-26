import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import type { Request, Response } from 'express'
import { Observable, tap } from 'rxjs'

/**
 * Query parameter names whose VALUE never reaches a log line. Case-insensitive
 * on the key; the key itself (and every other param) is left untouched — this
 * is a redaction, not a query-string strip, because most query params (page,
 * limit, filters…) carry real debug value.
 *
 * Finding pentest : les 7+ callbacks OAuth (`/auth/oauth/callback`,
 * `/google/callback`, `/crm/hubspot/callback`, `/salesforce/callback`,
 * `/pipedrive/callback`, `/notion/callback`, `/microsoft/callback`,
 * `/attio/callback`…) reçoivent `?code=…&state=…` — le `code` OAuth est un
 * secret à usage unique qui se retrouvait en clair dans les logs Railway à
 * CHAQUE requête, via `req.originalUrl` loggé intégralement.
 */
const SENSITIVE_QUERY_PARAMS = new Set([
  'code',
  'state',
  'token',
  'access_token',
  'id_token',
  'secret',
  'key',
  'password',
  'signature',
])

/** Redacts sensitive query parameter VALUES in a request path (`req.originalUrl`
 *  shape: `/path?a=1&b=2`). Keeps method/path/query structure intact so the log
 *  line stays useful — only the secret keeps its shape (`code=[redacted]`). */
function redactSensitiveQuery(originalUrl: string): string {
  const queryIndex = originalUrl.indexOf('?')
  if (queryIndex === -1) return originalUrl

  const path = originalUrl.slice(0, queryIndex)
  const query = originalUrl.slice(queryIndex + 1)
  const redacted = query
    .split('&')
    .map(pair => {
      const eqIndex = pair.indexOf('=')
      const rawKey = eqIndex === -1 ? pair : pair.slice(0, eqIndex)
      let decodedKey: string
      try {
        decodedKey = decodeURIComponent(rawKey).toLowerCase()
      } catch {
        decodedKey = rawKey.toLowerCase()
      }
      if (SENSITIVE_QUERY_PARAMS.has(decodedKey)) return `${rawKey}=[redacted]`
      return pair
    })
    .join('&')

  return `${path}?${redacted}`
}

/**
 * One success log line per HTTP request: `METHOD /path → status (Xms)`. Lets
 * you eyeball what's actually hitting the API without opening DevTools —
 * useful when debugging analysis runs that involve many cross-service calls.
 *
 * The query string is logged with sensitive parameter VALUES redacted (see
 * `SENSITIVE_QUERY_PARAMS`) — never the raw OAuth `code`/`state` and friends.
 *
 * Errors are logged once by `AllExceptionsFilter` with the resolved status
 * + response body — we intentionally skip them here to avoid duplicated
 * lines for the same request.
 */
@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP')

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle()

    const req = context.switchToHttp().getRequest<Request>()
    const res = context.switchToHttp().getResponse<Response>()
    const start = Date.now()
    const { method, originalUrl } = req
    const safeUrl = redactSensitiveQuery(originalUrl)

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(`${method} ${safeUrl} → ${res.statusCode} (${Date.now() - start}ms)`)
        },
      }),
    )
  }
}
