import { Agent, fetch as undiciFetch } from 'undici'
import { computeUrl } from './url.js'
import { redactSecrets } from './redact.js'
import { isRetryableStatus } from './status.js'
import { HttpError, HttpRetriesExhaustedError, HttpTimeoutError, TechnicalError, sleep } from '@bellum/errors'
import { failure, isSuccess, success, type Result } from '@bellum/utils'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * Dispatcher + fetch for long-running calls.
 *
 * Node's global `fetch` (undici) aborts with a generic `TypeError: fetch failed`
 * once its default 300s `headersTimeout` elapses — and a long IA phase (Phase-1
 * research streams no response headers until it finishes, 5+ min for large
 * groups) hits that BEFORE our own per-call `AbortSignal.timeout` (research is
 * allotted 480s). The 300s undici cap silently shadowed every configured budget
 * above 5 min, so big companies always failed mid-research.
 *
 * Two things matter here:
 *  1. We raise undici's header/body timeouts well past the worker's job cap
 *     (20 min) so they never shadow a per-call budget. `AbortSignal.timeout`
 *     stays the single source of truth — a call runs for exactly its budget.
 *  2. We call undici's OWN `fetch`, not Node's global one. A custom `Agent`
 *     from the standalone `undici` package is rejected (`UND_ERR_INVALID_ARG`)
 *     by the global fetch, which is bound to Node's bundled undici instance —
 *     the dispatcher and the fetch must come from the same undici.
 */
const DISPATCHER_TIMEOUT_MS = 1_800_000
const LONG_CALL_DISPATCHER = new Agent({
  headersTimeout: DISPATCHER_TIMEOUT_MS,
  bodyTimeout: DISPATCHER_TIMEOUT_MS,
})

/**
 * #2535.1 — un SECOND dispatcher, pour les appels INTERACTIFS (un commercial
 * regarde l'écran, budget de quelques dizaines de secondes) : Découvrir en
 * production a échoué à 45 s pendant qu'une analyse de compte tournait, et a
 * répondu en 11,9 s moteur au repos — la requête n'était pas trop lourde, elle
 * FAISAIT LA QUEUE derrière une analyse qui tient un socket ouvert plusieurs
 * minutes sur `LONG_CALL_DISPATCHER`, le seul pool undici que ce client
 * possédait jusqu'ici pour TOUT appel sortant vers le service IA.
 *
 * Même principe que la file `claude_chat` séparée de la file `claude` côté
 * service IA (16/08/2026, rate_limiter.py) : un travail de fond ne doit jamais
 * manger la file d'un tour interactif. Ici la ressource contendue n'est pas un
 * jeton de débit mais une CONNEXION — deux dispatchers undici, deux pools.
 *
 * Bornes généreuses mais PAS 30 min : un appel interactif n'a jamais de raison
 * légitime de tenir un socket plus de deux minutes (le plus long budget
 * interactif du dépôt est `CHAT_CALLER_BUDGET_MS` = 120 000 ms côté NestJS) —
 * si un jour il en tenait un plus longtemps que ça, c'est le budget appelant
 * qui a un bug, pas ce dispatcher qui doit le couvrir en silence.
 */
const INTERACTIVE_DISPATCHER_TIMEOUT_MS = 130_000
const INTERACTIVE_DISPATCHER = new Agent({
  headersTimeout: INTERACTIVE_DISPATCHER_TIMEOUT_MS,
  bodyTimeout: INTERACTIVE_DISPATCHER_TIMEOUT_MS,
})

/** Logger shape compatible with `console` and NestJS's `Logger` so callers can pass either as-is. */
export type HttpLogger = {
  log(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
}

export const DEFAULT_CORRELATION_ID_HEADER = 'x-correlation-id'

/**
 * URL descriptor accepted by `HttpClient.request`.
 *
 * `template` is the raw path (with optional `{placeholder}` markers resolved by `computeUrl`).
 * `variables` map placeholder names to values; `query` becomes the query string. `body` is a
 * separate top-level field on the request options — never put JSON body fields here.
 */
export type RequestUrlInfo = {
  template: string
  variables?: Record<string, string>
  query?: Record<string, string | undefined>
}

export type HttpClientRequestOptions = {
  urlInfo: RequestUrlInfo
  method?: HttpMethod
  body?: Record<string, unknown>
  headers?: Record<string, string>
  /**
   * Lit un en-tête de la réponse RÉUSSIE, sans changer ce que la méthode
   * renvoie (le corps). Sert aux métadonnées hors contrat — le registre de
   * coûts par fournisseur (`x-bellum-costs`) voyage ainsi sans que chaque
   * schéma métier ait à porter un bloc « facturation ». Best-effort : une
   * exception du lecteur est ignorée, elle ne casse pas l'appel.
   */
  onResponseHeader?: (name: string, value: string | null) => void
  /** Nom de l'en-tête lu par `onResponseHeader`. */
  responseHeaderName?: string
  /** Per-call timeout override (ms). Default: `HttpClientConfig.defaultTimeoutMs`. */
  timeoutMs?: number
  /** Max attempts including the initial one (`1` disables retries). */
  maxAttempts?: number
  /** External abort signal. Combined with the internal timeout via `AbortSignal.any`. */
  signal?: AbortSignal
  /**
   * #2535.1 — `true` route cet appel sur `INTERACTIVE_DISPATCHER` plutôt que
   * sur le pool de fond partagé par défaut. À poser sur tout appel dont
   * l'ÉCRAN attend la réponse (Découvrir, un tour de copilote synchrone) —
   * jamais sur un appel de fond (une phase d'analyse, un job BullMQ) : le
   * pool interactif est dimensionné pour des sockets courts, pas pour en tenir
   * un ouvert plusieurs minutes. Défaut `false` : tout appelant existant garde
   * exactement le comportement d'avant ce champ.
   */
  interactive?: boolean
}

export type HttpClientConfig = {
  baseUrl: string
  logger?: HttpLogger
  getCorrelationId?: () => string | undefined
  correlationIdHeader?: string
  /** Headers sent on every request (e.g. a shared internal-auth secret). Per-call `headers` win on conflict. */
  defaultHeaders?: Record<string, string>
  /** Default per-request timeout when the caller doesn't override. Default: 30s. */
  defaultTimeoutMs?: number
  /** Default retry budget including the initial attempt. Default: 2 (1 retry). */
  defaultMaxAttempts?: number
}

/** Internal classification of a single-attempt failure. Never leaks out of the client. */
type Problem =
  | { type: 'http_error'; error: HttpError }
  | { type: 'too_large'; error: ResponseTooLargeError }
  | { type: 'timeout'; error: HttpTimeoutError }
  | { type: 'network'; error: Error }

const BACKOFF_BASE_MS = 500
const BACKOFF_CAP_MS = 5_000
const ERROR_BODY_MAX_CHARS = 500

/** #4120 — plafond de lecture d'une réponse : au-delà, REJET (jamais un préfixe tronqué parsé). */
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024

/** #4120 — réponse plus grosse que `MAX_RESPONSE_BYTES`. Non réessayable. */
export class ResponseTooLargeError extends Error {
  readonly name = 'ResponseTooLargeError'
  readonly limitBytes: number
  readonly endpoint: string
  constructor(limitBytes: number, endpoint: string) {
    super(`Response on ${endpoint} exceeds ${limitBytes} bytes; rejected, not truncated`)
    this.limitBytes = limitBytes
    this.endpoint = endpoint
  }
}

/**
 * Lit le corps en flux, au plus `maxBytes` octets. `exceeded` = le corps dépasse la borne
 * (le flux est annulé ; `text` est alors vide et ne doit JAMAIS être parsé).
 */
async function readBounded(
  response: {
    body?: {
      cancel(): Promise<void>
      getReader?(): {
        read(): Promise<{ done: boolean; value?: Uint8Array }>
        cancel(): Promise<void>
      }
    } | null
    headers?: { get?(name: string): string | null }
    text?(): Promise<string>
    json?(): Promise<unknown>
  },
  maxBytes: number,
): Promise<{ text: string; exceeded: boolean }> {
  // #4122 — réponse réduite (mock de fetch) : headers/body/text/json peuvent manquer.
  const declaredHeader = response.headers?.get?.('content-length')
  const declared = declaredHeader == null ? Number.NaN : Number(declaredHeader)
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    return { text: '', exceeded: true }
  }
  const stream = response.body
  if (!stream?.getReader) {
    // Pas de flux lisible : text() (borne en octets) sinon json() (déjà parsé, sans borne possible).
    if (typeof response.text === 'function') {
      const text = await response.text()
      return Buffer.byteLength(text, 'utf8') > maxBytes ? { text: '', exceeded: true } : { text, exceeded: false }
    }
    if (typeof response.json === 'function') {
      return { text: JSON.stringify(await response.json()), exceeded: false }
    }
    return { text: '', exceeded: false }
  }
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done || !value) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return { text: '', exceeded: true }
    }
    chunks.push(value)
  }
  return { text: Buffer.concat(chunks).toString('utf8'), exceeded: false }
}
const NOOP_LOGGER: HttpLogger = { log: () => {}, warn: () => {} }

/** Full-jitter exponential backoff; caps a single wait so caller-level retries don't compound. */
function backoffDelay(attempt: number): number {
  const exp = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1), BACKOFF_CAP_MS)
  return Math.round(exp * (0.5 + Math.random() * 0.5))
}

/**
 * Reusable HTTP client for outbound calls to internal services.
 *
 * Centralises URL templating (`computeUrl`), per-call timeout, lightweight retry with
 * full-jitter exponential backoff, correlation ID propagation, and per-attempt structured
 * logs. On failure, the typed cause (`HttpError` / `HttpTimeoutError` / `HttpRetriesExhaustedError`
 * from `@bellum/errors`) is wrapped in a `TechnicalError` so callers can `instanceof` the
 * cause for classification without parsing strings.
 *
 * Subclass to bake in a baseUrl and a specific logger / correlation integration (e.g. a
 * NestJS app wires `Logger` + `CorrelationIdService`).
 */
export class HttpClient {
  protected readonly baseUrl: string
  protected readonly logger: HttpLogger
  protected readonly getCorrelationId: () => string | undefined
  protected readonly correlationIdHeader: string
  protected readonly defaultTimeoutMs: number
  protected readonly defaultMaxAttempts: number
  protected readonly defaultHeaders: Record<string, string>

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.logger = config.logger ?? NOOP_LOGGER
    this.getCorrelationId = config.getCorrelationId ?? (() => undefined)
    this.correlationIdHeader = config.correlationIdHeader ?? DEFAULT_CORRELATION_ID_HEADER
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30_000
    this.defaultMaxAttempts = config.defaultMaxAttempts ?? 3
    this.defaultHeaders = config.defaultHeaders ?? {}
  }

  async request<T>(options: HttpClientRequestOptions): Promise<T> {
    const method = options.method ?? 'POST'
    const template = options.urlInfo.template
    const maxAttempts = options.maxAttempts ?? this.defaultMaxAttempts
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs
    const url = `${this.baseUrl}${computeUrl({
      template: options.urlInfo.template,
      variables: options.urlInfo.variables ?? ({} as Record<never, string>),
      query: options.urlInfo.query,
    })}`
    const correlationId = this.getCorrelationId() ?? ''

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...options.headers,
    }
    if (correlationId) headers[this.correlationIdHeader] = correlationId

    let lastProblem: Problem | undefined
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await this.tryFetch<T>({
        url,
        method,
        headers,
        body: method !== 'GET' && options.body !== undefined ? JSON.stringify(options.body) : undefined,
        callerSignal: options.signal,
        timeoutMs,
        template,
        attempt,
        correlationId,
        onResponseHeader: options.onResponseHeader,
        responseHeaderName: options.responseHeaderName,
        interactive: options.interactive,
      })

      if (isSuccess(result)) return result.output.body

      lastProblem = result.problem
      const retryable =
        result.problem.type === 'too_large'
          ? false
          : result.problem.type !== 'http_error' || result.problem.error.retryable
      const isLast = attempt >= maxAttempts

      if (!retryable || isLast) {
        const cause =
          isLast && retryable
            ? new HttpRetriesExhaustedError(maxAttempts, template, { cause: result.problem.error })
            : result.problem.error
        throw new TechnicalError('HTTP request failed', {
          cause,
          context: { template, method, problemType: result.problem.type, attempts: attempt },
        })
      }

      try {
        await sleep(backoffDelay(attempt), { signal: options.signal })
      } catch {
        throw new TechnicalError('HTTP request aborted during backoff', {
          cause: result.problem.error,
          context: { template, method, attempts: attempt },
        })
      }
    }
    // Unreachable: the loop exit always throws before reaching here.
    throw new TechnicalError('HTTP request failed', {
      cause: lastProblem?.error,
      context: { template, method, unreachable: true },
    })
  }

  /**
   * Stream a Server-Sent Events response, yielding each `data:` payload parsed
   * as JSON. Uses the long-call dispatcher (header/body timeout 30 min) so the
   * connection can stay open for a multi-minute server-side run. Single attempt:
   * a half-consumed stream can't be transparently retried. Aborting `signal`
   * tears the connection down.
   *
   * `idleTimeoutMs` bounds the gap BETWEEN bytes, which is a different guarantee
   * from the total budget and the one that was missing. The dispatcher's body
   * timeout is deliberately set above the caller's job ceiling so it never
   * shadows a per-call budget — which also meant a producer that opened the
   * stream and then went silent (dead process, dropped connection with no FIN)
   * produced an `await reader.read()` that simply never returned. The consumer
   * could not distinguish that from a slow phase, so it waited out the entire
   * job ceiling and the user watched a frozen progress bar for twenty minutes.
   * Since our SSE producers emit keepalive comments during silent gaps, "no
   * bytes at all for N seconds" is unambiguous evidence the producer is gone.
   */
  protected async *streamSse<T>(args: {
    urlInfo: RequestUrlInfo
    method?: HttpMethod
    body?: Record<string, unknown>
    headers?: Record<string, string>
    signal?: AbortSignal
    /** Max gap between bytes before the stream is declared dead. Omit to disable. */
    idleTimeoutMs?: number
    /**
     * Lit un en-tête de la réponse RÉUSSIE avant de commencer à lire le
     * corps — la même métadonnée hors-contrat que `request()` (le registre de
     * coûts par fournisseur, `x-bellum-costs`), mais un flux ne rend jamais
     * son objet `Response` à l'appelant : sans ce chemin, un consommateur
     * streamé perdait la seule façon de lire cet en-tête. Best-effort : une
     * exception du lecteur est ignorée, elle ne casse pas le flux.
     */
    onResponseHeader?: (name: string, value: string | null) => void
    /** Nom de l'en-tête lu par `onResponseHeader`. */
    responseHeaderName?: string
  }): AsyncGenerator<T> {
    const url = `${this.baseUrl}${computeUrl({
      template: args.urlInfo.template,
      variables: args.urlInfo.variables ?? ({} as Record<never, string>),
      query: args.urlInfo.query,
    })}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...this.defaultHeaders,
      ...args.headers,
    }
    const correlationId = this.getCorrelationId() ?? ''
    if (correlationId) headers[this.correlationIdHeader] = correlationId

    const response = await undiciFetch(url, {
      method: args.method ?? 'POST',
      headers,
      body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
      dispatcher: LONG_CALL_DISPATCHER,
      signal: args.signal,
    })
    if (!response.ok || !response.body) {
      throw new TechnicalError('SSE request failed', {
        context: { template: args.urlInfo.template, status: response.status },
      })
    }
    if (args.onResponseHeader && args.responseHeaderName) {
      try {
        args.onResponseHeader(args.responseHeaderName, response.headers?.get?.(args.responseHeaderName) ?? null)
      } catch {
        // Une métadonnée ne fait jamais échouer le flux qu'elle décore.
      }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const idleMs = args.idleTimeoutMs
    let buffer = ''

    /** One read, bounded by the idle budget. The timer is cleared on every read
     *  so it measures the gap between chunks, not the total stream duration. */
    const readWithIdleBound = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
      if (!idleMs || idleMs <= 0) return reader.read()
      let timer: ReturnType<typeof setTimeout> | undefined
      const idle = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new HttpTimeoutError(idleMs, args.urlInfo.template, { cause: undefined })),
          idleMs,
        )
      })
      try {
        return await Promise.race([reader.read(), idle])
      } finally {
        if (timer) clearTimeout(timer)
      }
    }

    try {
      for (;;) {
        const { done, value } = await readWithIdleBound()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // SSE frames are separated by a blank line.
        let sep: number
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const dataLine = frame.split('\n').find(line => line.startsWith('data:'))
          if (dataLine) {
            const payload = dataLine.slice('data:'.length).trim()
            if (payload) yield JSON.parse(payload) as T
          }
        }
      }
    } finally {
      // Tear the socket down rather than leaving a half-read body pinned to the
      // dispatcher for its 30-min body timeout — on ANY exit, not only a thrown
      // read error. #2915.1: the worker's `for await (const ev of events)`
      // throws when a phase fails to persist; a `for await` loop whose body
      // throws calls `.return()` on this generator, which resumes it AT THE
      // SUSPENDED `yield` and runs this `finally` WITHOUT ever reaching a
      // `catch` (verified: async generators treat an injected `.return()` as a
      // `return`, not a `throw`). Cancelling only in `catch` left the reader
      // merely unlocked on that path — the connection to the IA stayed open,
      // and it kept running (and paying for Claude calls on) the rest of the
      // graph even though nobody was left to persist the output.
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }

  private async tryFetch<T>(args: {
    url: string
    method: HttpMethod
    headers: Record<string, string>
    body: string | undefined
    callerSignal: AbortSignal | undefined
    timeoutMs: number
    template: string
    attempt: number
    correlationId: string
    onResponseHeader?: (name: string, value: string | null) => void
    responseHeaderName?: string
    /** #2535.1 — voir `HttpClientRequestOptions.interactive`. */
    interactive?: boolean
  }): Promise<Result<{ body: T; status: number }, Problem>> {
    const startedAt = Date.now()
    const internalSignal = AbortSignal.timeout(args.timeoutMs)
    const signal = args.callerSignal ? AbortSignal.any([args.callerSignal, internalSignal]) : internalSignal

    let response: Awaited<ReturnType<typeof undiciFetch>>
    try {
      response = await undiciFetch(args.url, {
        method: args.method,
        headers: args.headers,
        body: args.body,
        signal,
        dispatcher: args.interactive ? INTERACTIVE_DISPATCHER : LONG_CALL_DISPATCHER,
      })
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      const problem: Problem =
        error.name === 'AbortError' || error.name === 'TimeoutError'
          ? { type: 'timeout', error: new HttpTimeoutError(args.timeoutMs, args.template, { cause: error }) }
          : { type: 'network', error }
      this.logAttempt('warn', 'Request failed', args, startedAt, problem)
      return failure(problem)
    }

    if (!response.ok) {
      // #4120 — lecture bornée, puis masquage AVANT troncature (un secret coupé en deux resterait lisible).
      const raw = await readBounded(response, MAX_RESPONSE_BYTES).catch(() => ({ text: '', exceeded: false }))
      const text = redactSecrets(raw.text).slice(0, ERROR_BODY_MAX_CHARS)
      const error = new HttpError(response.status, text, isRetryableStatus(response.status), args.template)
      const problem: Problem = { type: 'http_error', error }
      this.logAttempt('warn', 'Request failed', args, startedAt, problem, response.status)
      return failure(problem)
    }

    if (args.onResponseHeader && args.responseHeaderName) {
      try {
        args.onResponseHeader(args.responseHeaderName, response.headers?.get?.(args.responseHeaderName) ?? null)
      } catch {
        // Une métadonnée ne fait pas échouer l'appel qu'elle décore.
      }
    }
    // #4120 — borne de 8 MiB : au-delà, rejet typé non réessayable, jamais de JSON partiel.
    const raw = await readBounded(response, MAX_RESPONSE_BYTES)
    if (raw.exceeded) {
      const problem: Problem = {
        type: 'too_large',
        error: new ResponseTooLargeError(MAX_RESPONSE_BYTES, args.template),
      }
      this.logAttempt('warn', 'Request failed', args, startedAt, problem, response.status)
      return failure(problem)
    }
    const body = JSON.parse(raw.text) as T
    this.logAttempt('log', 'Request succeeded', args, startedAt, undefined, response.status)
    return success({ body, status: response.status })
  }

  private logAttempt(
    level: 'log' | 'warn',
    message: string,
    ctx: { template: string; method: HttpMethod; attempt: number; correlationId: string },
    startedAt: number,
    problem: Problem | undefined,
    status?: number,
  ): void {
    const meta: Record<string, unknown> = {
      template: ctx.template,
      method: ctx.method,
      attempt: ctx.attempt,
      latencyMs: Date.now() - startedAt,
      correlationId: ctx.correlationId,
    }
    if (status !== undefined) meta['status'] = status
    if (problem) {
      meta['problemType'] = problem.type
      meta['error'] = problem.error.message
    }
    this.logger[level](message, meta)
  }
}
