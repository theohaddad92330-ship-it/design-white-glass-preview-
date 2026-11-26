import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import type { Request } from 'express'
import { getCorrelationId } from '../correlation-id/correlation-id.store'
import { sanitizeUserFacingText, supportReference } from './observability-privacy'

/**
 * Catch-all filter so every error reply gets a one-line log entry — including
 * exceptions thrown by guards (e.g. ThrottlerGuard 429), which run before the
 * HTTP interceptor and were silently bouncing back to the client with no log.
 *
 * The filter only logs and forwards the response through the underlying HTTP
 * adapter; it does not swallow or rewrite the body.
 *
 * One correction, and it mattered in production: an exception that is NOT an
 * `HttpException` used to be answered with the bare STRING `'Internal server
 * error'`. Express serialises a string body as `text/html`, so the reply was not
 * JSON at all — and the web's `extractError` (`apps/web/src/lib/api.ts`), whose
 * `res.json()` then threw, fell through to its last-resort `'API error'`. That
 * is how a seller clicking « Enrichir » came to read an untranslated
 * three-syllable non-explanation: every layer preserved the failure and dropped
 * the reason. The body is now the JSON object Nest's own default filter
 * produces, so a client can always parse *something*, whatever went wrong.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP')

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      throw exception as Error
    }

    const { httpAdapter } = this.httpAdapterHost
    const ctx = host.switchToHttp()
    const req = ctx.getRequest<Request>()
    const res = ctx.getResponse<unknown>()

    const status = exception instanceof HttpException ? exception.getStatus() : 500
    const rawBody: unknown =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: 500, message: 'Internal server error', error: 'Internal Server Error' }
    // #2442.5 / #2442.6 — le dernier passage avant le navigateur : la réponse
    // reçoit sa référence support, et rien d'interne n'en sort.
    const responseBody: unknown = publicBody(rawBody, supportReference(getCorrelationId()))
    const message = exception instanceof Error ? exception.message : String(exception)

    const line = `${req.method} ${req.originalUrl} → ${status} ${message}`
    if (status >= 500) this.logger.error(line)
    else this.logger.warn(line)

    // Un 429 sans `Retry-After` laisse le client deviner, donc réessayer tout
    // de suite, donc reprendre un 429 : c'est ainsi qu'un onglet a bouclé douze
    // fois de suite en prod. Le garde pose bien l'en-tête, mais cette réponse
    // est reconstruite ici et le perdait. On le repose depuis la fenêtre réelle.
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      setRetryAfter(res, RETRY_AFTER_SECONDS)
    }

    httpAdapter.reply(res, responseBody, status)
  }
}

/**
 * #2442.5 / #2442.6 — LE CORPS QUE LE NAVIGATEUR A LE DROIT DE LIRE.
 *
 * Ce filtre est `@Catch()` nu et posé globalement : TOUTE réponse d'erreur du
 * produit passe ici. C'est donc le seul endroit où les deux règles se tiennent
 * d'un coup, au lieu d'être promises à chaque contrôleur.
 *
 * Ce qu'il fait, et pourquoi chaque choix :
 *   — #2442.5 la référence support est AJOUTÉE, jamais substituée : un corps
 *     qui explique déjà (`{message, code}`, le diff d'un 409) garde tout ce
 *     qu'il porte. Absente quand il n'y a pas d'identifiant de corrélation :
 *     « non mesuré » n'est jamais une valeur inventée.
 *   — #2442.6 les champs de PHRASE (`message`, `error`, `whatHappened`,
 *     `notDone`, `nextAction`) passent par le filet complet, fournisseurs
 *     compris. Les autres chaînes — des DONNÉES qu'un contrôleur a
 *     délibérément mises là — ne passent que par les détecteurs STRUCTURELS
 *     (pile, position de fichier, SQL, contrainte, secret) : un compte qui
 *     s'appellerait comme un de nos fournisseurs ne doit pas voir son propre
 *     nom effacé du diff qu'on lui rend.
 *   — un corps qui n'est PAS un objet devient un objet. `new HttpException(
 *     'texte', 500).getResponse()` rend une CHAÎNE, qu'Express sérialise en
 *     `text/html` : c'est le défaut décrit en tête de fichier, et un corps
 *     `text/html` ne peut porter ni code, ni référence support.
 *
 * ⚠️ Ce qu'il ne fait PAS : il ne réécrit pas une phrase absente. Un bon
 * message d'erreur est écrit par le code qui le lève (`journeyError` en donne
 * la forme) ; ceci est un filet, pas un rédacteur.
 */
const PHRASE_FIELDS: ReadonlySet<string> = new Set([
  'message',
  'error',
  'whatHappened',
  'notDone',
  'nextAction',
  'description',
  'reason',
])

/** Au-delà, on ne descend plus : un corps d'erreur profond de plus de cinq
 *  niveaux n'est plus une explication. */
const MAX_BODY_DEPTH = 5

function publicBody(body: unknown, reference: string | null): unknown {
  const cleaned = scrubBody(body, false, 0)
  const asObject =
    cleaned !== null && typeof cleaned === 'object' && !Array.isArray(cleaned)
      ? (cleaned as Record<string, unknown>)
      : { message: typeof cleaned === 'string' ? cleaned : 'Internal server error' }
  return reference === null ? asObject : { ...asObject, supportReference: reference }
}

function scrubBody(value: unknown, isPhrase: boolean, depth: number): unknown {
  if (typeof value === 'string') return sanitizeUserFacingText(value, { suppliers: isPhrase })
  if (value === null || typeof value !== 'object' || depth >= MAX_BODY_DEPTH) return value
  if (Array.isArray(value)) return value.map(item => scrubBody(item, isPhrase, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = scrubBody(child, isPhrase || PHRASE_FIELDS.has(key), depth + 1)
  }
  return out
}

/** Fenêtre du throttler global (`app.module.ts`, ttl 60 s). */
const RETRY_AFTER_SECONDS = 60

function setRetryAfter(res: unknown, seconds: number): void {
  const setHeader = (res as { setHeader?: (name: string, value: string) => void }).setHeader
  if (typeof setHeader === 'function') {
    setHeader.call(res, 'Retry-After', String(seconds))
  }
}
