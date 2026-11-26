import * as winston from 'winston'
import { WinstonModule } from 'nest-winston'
import { LoggerService } from '@nestjs/common'
import { getCorrelationId } from '../correlation-id/correlation-id.store'
import { SentryWinstonTransport } from '../sentry/sentry-winston.transport'
import { rawCaptureDecision, redactForLog, redactSecrets } from './observability-privacy'

const isDev = process.env['NODE_ENV'] !== 'production'

const SPLAT = Symbol.for('splat') as unknown as string

/**
 * `JSON.stringify(new Error('boom'))` → `'{}'` because `message`/`stack` are
 * non-enumerable. Replacer here extracts those fields whenever the visited
 * value is an Error, so a `{ error: someError }` meta blob actually shows
 * the message instead of `{"name":"Error"}`.
 */
function errorReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  return value
}

function serializeArg(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`
  try {
    return JSON.stringify(arg, errorReplacer)
  } catch {
    return String(arg)
  }
}

/**
 * Recursively replace any ``Error`` found inside ``value`` with a plain,
 * enumerable object — the same shape ``errorReplacer`` gives ``JSON.stringify``
 * above, but applied to the winston ``info`` object itself, BEFORE
 * ``winston.format.json()`` runs. #2528: without this, an error nested under a
 * meta key (``logger.error('Analysis terminal failure', { error, tags, ... })``)
 * reached the production JSON transport as ``{}`` (or ``{"name":"..."}`` for a
 * subclass that sets ``this.name`` as an own property) because ``message`` and
 * ``stack`` are non-enumerable own properties of ``Error.prototype`` — plain
 * ``JSON.stringify`` never sees them.
 */
function deepExpandErrors(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  if (Array.isArray(value)) {
    return value.map(v => deepExpandErrors(v, seen))
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = deepExpandErrors(v, seen)
    }
    return result
  }
  return value
}

/**
 * Winston format step for the production JSON pipeline: walks every meta key
 * on ``info`` (skipping ``level``/``message``, which are the log line itself,
 * never a payload to expand) and expands any nested ``Error`` in place. See
 * ``deepExpandErrors`` for why this is needed at all.
 */
export function expandNestedErrors(info: winston.Logform.TransformableInfo): winston.Logform.TransformableInfo {
  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'message') continue
    const value = (info as Record<string, unknown>)[key]
    if (value && typeof value === 'object') {
      ;(info as Record<string, unknown>)[key] = deepExpandErrors(value)
    }
  }
  return info
}

/**
 * #2442.7 / #2442.8 / #2442.9 — LE PUITS DU JOURNAL.
 *
 * Chaque ligne, dev comme production, passe par ici avant d'atteindre un
 * transport. C'est le seul endroit où la règle « le contenu brut d'une donnée
 * privée n'entre pas dans un journal » peut être tenue : `apps/api/src/modules`
 * compte plus de mille appels à `logger.*`, et le mille-et-unième ne relira pas
 * la convention. Voir `observability-privacy.ts` pour les deux listes et les
 * quatre arbitrages.
 *
 * Trois précautions, chacune apprise sur ce fichier :
 *   — le SPLAT (`Symbol.for('splat')`) est traité explicitement : `Object.keys`
 *     ne voit pas les clés symboles, et c'est justement par le splat qu'arrive
 *     `logger.error('échec', { draft })`, la forme la plus fréquente du dépôt ;
 *   — `message` n'est pas DÉCRIT (on perdrait la ligne) mais il est caviardé
 *     par FORME : `logger.error(\`échec ${url}\`)` peut porter un jeton ;
 *   — `level`, `timestamp` et le `context` du logger Nest ne sont pas touchés.
 *
 * #2442.9 / #2442.19 — la capture brute passe par une PORTE : sans
 * `SUPPORT_RAW_CAPTURE_WINDOWS`, rien ne change. Fenêtre ouverte, chaque ligne
 * capturée porte `raw_capture_audit` : le journal dit LUI-MÊME sous quelle
 * référence un contenu brut a été vu, et par qui il faudra en répondre.
 */
export function redactLogInfo(info: winston.Logform.TransformableInfo): winston.Logform.TransformableInfo {
  const context = typeof info['context'] === 'string' ? (info['context'] as string) : undefined
  const decision = rawCaptureDecision({ context, now: new Date() })
  const rawCapture = decision.allowed
  const options = { rawCapture }

  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'timestamp' || key === 'context') continue
    if (key === 'message') {
      if (typeof info.message === 'string') info.message = redactSecrets(info.message)
      continue
    }
    ;(info as Record<string, unknown>)[key] = redactForLog((info as Record<string, unknown>)[key], options)
  }

  const splat = (info as Record<string, unknown>)[SPLAT]
  if (Array.isArray(splat)) {
    ;(info as Record<string, unknown>)[SPLAT] = splat.map(entry => redactForLog(entry, options))
  }

  if (decision.allowed) (info as Record<string, unknown>)['raw_capture_audit'] = decision.auditReference
  return info
}

function isContextEcho(arg: unknown, ctx: string): boolean {
  // nest-winston duplicates the bound context as `{context: 'X'}` in the splat —
  // we already render the bracket, so drop the redundant copy.
  if (!arg || typeof arg !== 'object') return false
  const keys = Object.keys(arg as Record<string, unknown>)
  return keys.length === 1 && keys[0] === 'context' && (arg as Record<string, unknown>).context === ctx
}

export function devFormat(info: winston.Logform.TransformableInfo): string {
  const { timestamp, level, message } = info
  const context = (info as { context?: unknown }).context
  const splat = (info as Record<string, unknown>)[SPLAT] as unknown[] | undefined

  let ctxStr = ''
  let metaStr = ''
  if (typeof context === 'string' && context.length > 0) {
    ctxStr = `[${context}] `
  } else if (context && typeof context === 'object') {
    metaStr = ' ' + serializeArg(context)
  }
  if (splat && splat.length > 0) {
    const ctxString = typeof context === 'string' ? context : ''
    const filtered = ctxString ? splat.filter(s => !isContextEcho(s, ctxString)) : splat
    if (filtered.length > 0) {
      metaStr += ' ' + filtered.map(serializeArg).join(' ')
    }
  }
  const cid = getCorrelationId()
  const cidStr = cid ? `[${cid.slice(0, 8)}] ` : ''
  return `${timestamp} ${level} ${cidStr}${ctxStr}${message}${metaStr}`
}

export function createLogger(): LoggerService {
  return WinstonModule.createLogger({
    transports: [
      new winston.transports.Console({
        format: isDev
          ? winston.format.combine(
              winston.format.colorize({ all: true }),
              winston.format.timestamp({ format: 'HH:mm:ss' }),
              // #2442.7 — le puits vaut AUSSI en développement : une machine de
              // développement lit parfois des données réelles, et une règle qui
              // ne tient que sur un environnement se découvre sur l'autre.
              winston.format(redactLogInfo)(),
              winston.format.printf(devFormat),
            )
          : winston.format.combine(
              winston.format.timestamp(),
              winston.format(info => {
                const cid = getCorrelationId()
                if (cid) info['correlation_id'] = cid
                return info
              })(),
              // #2442.7 — AVANT toute sérialisation : le contenu privé ne doit
              // pas exister dans l'objet que `json()` écrit.
              winston.format(redactLogInfo)(),
              // #2528 — must run BEFORE `winston.format.json()`: see `expandNestedErrors`.
              winston.format(expandNestedErrors)(),
              winston.format.json(),
            ),
      }),
      new SentryWinstonTransport(),
    ],
  })
}
