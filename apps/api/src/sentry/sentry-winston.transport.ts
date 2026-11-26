import Transport from 'winston-transport'
import * as Sentry from '@sentry/nestjs'
import { getCorrelationId } from '../correlation-id/correlation-id.store'

/**
 * Winston → Sentry bridge.
 *
 * Every `logger.error(...)` (and `logger.warn` when explicitly opted in) becomes a Sentry event
 * with the correlation ID and all meta fields attached as tags/extras. This is the single
 * entry point for error reporting — handlers MUST NOT call `Sentry.captureException` directly.
 * Letting logger.error route to Sentry keeps tag/context attribution consistent and avoids
 * double-capture.
 *
 * The transport is silent when `SENTRY_DSN` is unset, so dev machines don't spam Sentry.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const EMAIL = /[^\s@()]+@[^\s@()]+\.[^\s@()]+/g
const DATE = /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?/g
const NUMBER = /\d+/g
const PARENS = /\([^)]*\)/g
/** « Titre — <sujet variable> : détail » : le sujet (client, espace…) ne fait pas la cause. */
const SUBJECT = /( — )[^:]+?( : )/

/**
 * Message → clé de cause : ce qui varie d'un événement à l'autre (identifiant, nombre, date,
 * e-mail, texte entre parenthèses, sujet entre « — » et « : ») devient un jeton fixe, pour que
 * les événements d'une même cause tombent dans une seule issue Sentry.
 */
export function normalizeMessage(message: string): string {
  return message
    .replace(PARENS, '(…)')
    .replace(UUID, '<id>')
    .replace(EMAIL, '<email>')
    .replace(DATE, '<date>')
    .replace(NUMBER, '<n>')
    .replace(SUBJECT, '$1<…>$2')
    .trim()
}

/** Nest passe la pile en tableau ; on la joint, et on ne laisse jamais `[Object]`. */
function stackToString(stack: unknown): string | undefined {
  if (typeof stack === 'string') return stack
  if (Array.isArray(stack)) {
    const parts = stack.map(part => (part instanceof Error ? (part.stack ?? part.message) : String(part)))
    return parts.join('\n')
  }
  return undefined
}

/** Une vraie `Error` cachée dans les métadonnées (`error`, `err`, `cause`, élément de `stack`). */
function findRealError(...candidates: unknown[]): Error | undefined {
  for (const candidate of candidates) {
    if (candidate instanceof Error) return candidate
    if (Array.isArray(candidate)) {
      const inner = candidate.find((part): part is Error => part instanceof Error)
      if (inner) return inner
    }
  }
  return undefined
}

export class SentryWinstonTransport extends Transport {
  constructor(opts?: Transport.TransportStreamOptions) {
    super({ level: 'error', ...opts })
  }

  log(info: Record<string, unknown>, next: () => void): void {
    if (!process.env['SENTRY_DSN']) return next()

    const { level, message, stack, error, err, cause, tags, user, contexts, ...rest } = info
    const level_ = String(level) as Sentry.SeverityLevel
    const message_ = String(message ?? '')
    const cid = getCorrelationId()

    Sentry.withScope(scope => {
      if (cid) scope.setTag('correlation_id', cid)

      // Recognized meta keys map to first-class Sentry fields.
      if (tags && typeof tags === 'object') {
        for (const [k, v] of Object.entries(tags)) scope.setTag(k, String(v))
      }
      if (user && typeof user === 'object') {
        scope.setUser(user as Sentry.User)
      }
      if (contexts && typeof contexts === 'object') {
        for (const [k, v] of Object.entries(contexts)) scope.setContext(k, v as Record<string, unknown>)
      }

      // Unknown keys (NestJS `context`, free-form metadata) fall through to `extra`.
      let loggerContext = ''
      for (const [k, v] of Object.entries(rest)) {
        if (k === 'context') {
          loggerContext = String(v)
          scope.setTag('logger_context', loggerContext)
        } else scope.setExtra(k, v)
      }

      scope.setFingerprint(['winston', loggerContext, normalizeMessage(message_)])

      const stackText = stackToString(stack)
      if (stackText) scope.setExtra('stack', stackText)

      const real = findRealError(error, err, cause, stack)
      if (real) {
        Sentry.captureException(real, { level: level_ })
      } else if (error && typeof error === 'object') {
        Sentry.captureException(new Error(message_), { level: level_, extra: { original: error } })
      } else if (stackText) {
        const synthetic = new Error(message_)
        synthetic.stack = `Error: ${message_}\n${stackText}`
        Sentry.captureException(synthetic, { level: level_ })
      } else {
        Sentry.captureMessage(message_, level_)
      }
    })

    next()
  }
}
