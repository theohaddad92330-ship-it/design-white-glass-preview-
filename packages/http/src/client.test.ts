import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError, HttpRetriesExhaustedError, HttpTimeoutError, TechnicalError } from '@bellum/errors'

// The client calls undici's OWN `fetch` (a standalone-undici Agent dispatcher is
// rejected by Node's global fetch), so we mock the `undici` module rather than
// stubbing global fetch. `Agent` is stubbed too — it's `new`-ed at module load.
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))
vi.mock('undici', () => ({
  Agent: vi.fn(),
  fetch: fetchMock,
}))

import { HttpClient, DEFAULT_CORRELATION_ID_HEADER } from './client.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } })
}

describe('HttpClient', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    // Deterministic backoff: skip real waits.
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('URL composition', () => {
    it('joins baseUrl with the resolved template and variables', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
      const client = new HttpClient({ baseUrl: 'https://api.test' })

      await client.request({
        urlInfo: { template: '/v1/jobs/{jobId}', variables: { jobId: '42' } },
        method: 'GET',
      })

      const [url] = fetchMock.mock.calls[0]!
      expect(url).toBe('https://api.test/v1/jobs/42')
    })

    it('strips trailing slashes from baseUrl', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
      const client = new HttpClient({ baseUrl: 'https://api.test///' })

      await client.request({ urlInfo: { template: '/v1/x' }, method: 'GET' })

      const [url] = fetchMock.mock.calls[0]!
      expect(url).toBe('https://api.test/v1/x')
    })

    it('appends query parameters', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
      const client = new HttpClient({ baseUrl: 'https://api.test' })

      await client.request({
        urlInfo: { template: '/search', query: { q: 'foo' } },
        method: 'GET',
      })

      const [url] = fetchMock.mock.calls[0]!
      expect(url).toBe('https://api.test/search?q=foo')
    })
  })

  describe('request body + headers', () => {
    it('defaults to POST with JSON-stringified body', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
      const client = new HttpClient({ baseUrl: 'https://api.test' })

      await client.request({
        urlInfo: { template: '/v1/x' },
        body: { a: 1 },
      })

      const [, init] = fetchMock.mock.calls[0]!
      expect(init?.method).toBe('POST')
      expect(init?.body).toBe(JSON.stringify({ a: 1 }))
      expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    })

    it('sends configured defaultHeaders on every request', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
      const client = new HttpClient({ baseUrl: 'https://api.test', defaultHeaders: { 'x-internal-secret': 's3cret' } })

      await client.request({ urlInfo: { template: '/v1/x' }, body: { a: 1 } })

      const [, init] = fetchMock.mock.calls[0]!
      expect((init?.headers as Record<string, string>)['x-internal-secret']).toBe('s3cret')
    })

    it('lets a per-call header override a defaultHeader', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
      const client = new HttpClient({ baseUrl: 'https://api.test', defaultHeaders: { 'x-internal-secret': 's3cret' } })

      await client.request({ urlInfo: { template: '/v1/x' }, headers: { 'x-internal-secret': 'override' } })

      const [, init] = fetchMock.mock.calls[0]!
      expect((init?.headers as Record<string, string>)['x-internal-secret']).toBe('override')
    })

    it('does not serialize a body for GET requests', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
      const client = new HttpClient({ baseUrl: 'https://api.test' })

      await client.request({
        urlInfo: { template: '/v1/x' },
        method: 'GET',
        body: { a: 1 },
      })

      const [, init] = fetchMock.mock.calls[0]!
      expect(init?.body).toBeUndefined()
    })

    it('merges caller-supplied headers over defaults', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
      const client = new HttpClient({ baseUrl: 'https://api.test' })

      await client.request({
        urlInfo: { template: '/v1/x' },
        method: 'GET',
        headers: { Authorization: 'Bearer xyz' },
      })

      const [, init] = fetchMock.mock.calls[0]!
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer xyz')
    })
  })

  describe('correlation id', () => {
    it('attaches the default correlation id header when resolver returns a value', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
      const client = new HttpClient({
        baseUrl: 'https://api.test',
        getCorrelationId: () => 'corr-123',
      })

      await client.request({ urlInfo: { template: '/v1/x' }, method: 'GET' })

      const [, init] = fetchMock.mock.calls[0]!
      expect((init?.headers as Record<string, string>)[DEFAULT_CORRELATION_ID_HEADER]).toBe('corr-123')
    })

    it('uses a custom correlation id header name', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
      const client = new HttpClient({
        baseUrl: 'https://api.test',
        getCorrelationId: () => 'corr-456',
        correlationIdHeader: 'x-trace-id',
      })

      await client.request({ urlInfo: { template: '/v1/x' }, method: 'GET' })

      const [, init] = fetchMock.mock.calls[0]!
      expect((init?.headers as Record<string, string>)['x-trace-id']).toBe('corr-456')
    })

    it('omits the header when the resolver returns undefined', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
      const client = new HttpClient({ baseUrl: 'https://api.test' })

      await client.request({ urlInfo: { template: '/v1/x' }, method: 'GET' })

      const [, init] = fetchMock.mock.calls[0]!
      expect((init?.headers as Record<string, string>)[DEFAULT_CORRELATION_ID_HEADER]).toBeUndefined()
    })
  })

  describe('success', () => {
    it('parses and returns the JSON body', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ id: 'abc' }))
      const client = new HttpClient({ baseUrl: 'https://api.test' })

      const out = await client.request<{ id: string }>({
        urlInfo: { template: '/v1/x' },
        method: 'GET',
      })

      expect(out).toEqual({ id: 'abc' })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('retry policy', () => {
    it('does NOT retry non-retryable 4xx (e.g. 404) and throws TechnicalError wrapping HttpError', async () => {
      fetchMock.mockResolvedValue(textResponse('Not Found', 404))
      const client = new HttpClient({ baseUrl: 'https://api.test', defaultMaxAttempts: 3 })

      await expect(client.request({ urlInfo: { template: '/v1/x' }, method: 'GET' })).rejects.toBeInstanceOf(
        TechnicalError,
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('exposes HttpError (404) as the cause and preserves status/body', async () => {
      fetchMock.mockResolvedValue(textResponse('Not Found', 404))
      const client = new HttpClient({ baseUrl: 'https://api.test' })

      try {
        await client.request({ urlInfo: { template: '/v1/x' }, method: 'GET' })
      } catch (err) {
        const tech = err as TechnicalError
        const cause = (tech as unknown as { cause: HttpError }).cause
        expect(cause).toBeInstanceOf(HttpError)
        expect(cause.status).toBe(404)
        expect(cause.body).toBe('Not Found')
        expect(cause.retryable).toBe(false)
        return
      }
      throw new Error('should have thrown')
    })

    it('retries on 503 and succeeds on the 2nd attempt', async () => {
      fetchMock
        .mockResolvedValueOnce(textResponse('Unavailable', 503))
        .mockResolvedValueOnce(jsonResponse({ ok: true }))
      const client = new HttpClient({ baseUrl: 'https://api.test', defaultMaxAttempts: 3 })

      const out = await client.request<{ ok: boolean }>({
        urlInfo: { template: '/v1/x' },
        method: 'GET',
      })

      expect(out).toEqual({ ok: true })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('exhausts the retry budget on persistent 503 and wraps in HttpRetriesExhaustedError', async () => {
      fetchMock.mockResolvedValue(textResponse('Unavailable', 503))
      const client = new HttpClient({ baseUrl: 'https://api.test', defaultMaxAttempts: 2 })

      try {
        await client.request({ urlInfo: { template: '/v1/x' }, method: 'GET' })
      } catch (err) {
        const tech = err as TechnicalError
        const cause = (tech as unknown as { cause: HttpRetriesExhaustedError }).cause
        expect(cause).toBeInstanceOf(HttpRetriesExhaustedError)
        expect(cause.attempts).toBe(2)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        return
      }
      throw new Error('should have thrown')
    })

    it('retries on network failures', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(jsonResponse({ ok: true }))
      const client = new HttpClient({ baseUrl: 'https://api.test', defaultMaxAttempts: 2 })

      const out = await client.request<{ ok: boolean }>({
        urlInfo: { template: '/v1/x' },
        method: 'GET',
      })

      expect(out).toEqual({ ok: true })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('retries on 429 (rate-limited)', async () => {
      fetchMock.mockResolvedValueOnce(textResponse('slow down', 429)).mockResolvedValueOnce(jsonResponse({ ok: true }))
      const client = new HttpClient({ baseUrl: 'https://api.test', defaultMaxAttempts: 2 })

      const out = await client.request({ urlInfo: { template: '/v1/x' }, method: 'GET' })
      expect(out).toEqual({ ok: true })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('honours maxAttempts override at call site', async () => {
      fetchMock.mockResolvedValue(textResponse('Unavailable', 503))
      const client = new HttpClient({ baseUrl: 'https://api.test', defaultMaxAttempts: 5 })

      await expect(
        client.request({
          urlInfo: { template: '/v1/x' },
          method: 'GET',
          maxAttempts: 1,
        }),
      ).rejects.toBeInstanceOf(TechnicalError)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('timeout', () => {
    it('classifies an AbortError as HttpTimeoutError (wrapped in HttpRetriesExhaustedError on last retryable attempt)', async () => {
      fetchMock.mockImplementation(() => {
        const err = new Error('timed out')
        err.name = 'AbortError'
        return Promise.reject(err)
      })
      const client = new HttpClient({
        baseUrl: 'https://api.test',
        defaultMaxAttempts: 1,
        defaultTimeoutMs: 50,
      })

      try {
        await client.request({ urlInfo: { template: '/v1/slow' }, method: 'GET' })
      } catch (err) {
        const tech = err as TechnicalError
        const outer = (tech as unknown as { cause: HttpRetriesExhaustedError }).cause
        expect(outer).toBeInstanceOf(HttpRetriesExhaustedError)
        expect(outer.endpoint).toBe('/v1/slow')
        const inner = (outer as unknown as { cause: HttpTimeoutError }).cause
        expect(inner).toBeInstanceOf(HttpTimeoutError)
        expect(inner.timeoutMs).toBe(50)
        expect(inner.endpoint).toBe('/v1/slow')
        return
      }
      throw new Error('should have thrown')
    })
  })

  // #2535.1 — un appel INTERACTIF (l'écran attend) ne doit jamais faire la
  // queue derrière un socket qu'un appel de FOND (une analyse, minutes) tient
  // ouvert sur le MÊME dispatcher partagé. Preuve unitaire : deux dispatchers
  // undici distincts, jamais le même objet.
  describe('dispatcher selection (#2535.1)', () => {
    it('routes an interactive request through a different dispatcher than the default (background) one', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })))
      const client = new HttpClient({ baseUrl: 'https://api.test' })

      await client.request({ urlInfo: { template: '/v1/background' }, method: 'GET' })
      await client.request({ urlInfo: { template: '/v1/interactive' }, method: 'GET', interactive: true })

      const backgroundDispatcher = (fetchMock.mock.calls[0]![1] as { dispatcher: unknown }).dispatcher
      const interactiveDispatcher = (fetchMock.mock.calls[1]![1] as { dispatcher: unknown }).dispatcher
      expect(interactiveDispatcher).not.toBe(backgroundDispatcher)
    })

    it('reuses the SAME interactive dispatcher across calls — one pool, not one per request', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })))
      const client = new HttpClient({ baseUrl: 'https://api.test' })

      await client.request({ urlInfo: { template: '/v1/a' }, method: 'GET', interactive: true })
      await client.request({ urlInfo: { template: '/v1/b' }, method: 'GET', interactive: true })

      const first = (fetchMock.mock.calls[0]![1] as { dispatcher: unknown }).dispatcher
      const second = (fetchMock.mock.calls[1]![1] as { dispatcher: unknown }).dispatcher
      expect(second).toBe(first)
    })
  })

  describe('logging', () => {
    it('emits a log on success with status + latency + correlationId', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
      const log = vi.fn()
      const warn = vi.fn()
      const client = new HttpClient({
        baseUrl: 'https://api.test',
        logger: { log, warn },
        getCorrelationId: () => 'c1',
      })

      await client.request({ urlInfo: { template: '/v1/x' }, method: 'GET' })

      expect(log).toHaveBeenCalledTimes(1)
      const meta = log.mock.calls[0]![1] as Record<string, unknown>
      expect(meta['template']).toBe('/v1/x')
      expect(meta['method']).toBe('GET')
      expect(meta['attempt']).toBe(1)
      expect(meta['status']).toBe(200)
      expect(meta['correlationId']).toBe('c1')
      expect(typeof meta['latencyMs']).toBe('number')
    })

    it('emits a warn with problemType on failure', async () => {
      fetchMock.mockResolvedValue(textResponse('nope', 404))
      const log = vi.fn()
      const warn = vi.fn()
      const client = new HttpClient({
        baseUrl: 'https://api.test',
        logger: { log, warn },
        defaultMaxAttempts: 1,
      })

      await client.request({ urlInfo: { template: '/v1/x' }, method: 'GET' }).catch(() => undefined)

      expect(warn).toHaveBeenCalledTimes(1)
      const meta = warn.mock.calls[0]![1] as Record<string, unknown>
      expect(meta['problemType']).toBe('http_error')
      expect(meta['status']).toBe(404)
    })
  })

  describe('streamSse', () => {
    // streamSse is protected — expose it for the test.
    class StreamClient extends HttpClient {
      stream<T>(args: Parameters<HttpClient['streamSse']>[0]): AsyncGenerator<T> {
        return this.streamSse<T>(args)
      }
    }

    async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
      const out: T[] = []
      for await (const x of gen) out.push(x)
      return out
    }

    it('yields each SSE data frame parsed as JSON', async () => {
      const sse =
        'data: {"type":"phase_completed","phase":"research"}\n\n' + 'data: {"type":"run_completed","progress":100}\n\n'
      fetchMock.mockResolvedValue(new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } }))
      const client = new StreamClient({ baseUrl: 'https://api.test' })

      const events = await collect(client.stream({ urlInfo: { template: '/graph/analyze' } }))

      expect(events).toEqual([
        { type: 'phase_completed', phase: 'research' },
        { type: 'run_completed', progress: 100 },
      ])
    })

    it('handles a frame split across chunks', async () => {
      // Two reads where a single SSE frame straddles the boundary.
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const enc = new TextEncoder()
          controller.enqueue(enc.encode('data: {"type":"phase_comp'))
          controller.enqueue(enc.encode('leted","phase":"plan"}\n\n'))
          controller.close()
        },
      })
      fetchMock.mockResolvedValue(new Response(body, { status: 200 }))
      const client = new StreamClient({ baseUrl: 'https://api.test' })

      const events = await collect(client.stream({ urlInfo: { template: '/graph/analyze' } }))

      expect(events).toEqual([{ type: 'phase_completed', phase: 'plan' }])
    })

    it('throws on a non-2xx response', async () => {
      fetchMock.mockResolvedValue(new Response('nope', { status: 500 }))
      const client = new StreamClient({ baseUrl: 'https://api.test' })

      await expect(collect(client.stream({ urlInfo: { template: '/graph/analyze' } }))).rejects.toThrow(TechnicalError)
    })

    it('gives up on a stream that goes silent instead of waiting for the job ceiling', async () => {
      // A producer that opens the stream and then says nothing — the shape of an
      // IA process that died or a connection that dropped without a FIN. undici's
      // bodyTimeout is deliberately set ABOVE the worker's job ceiling, so before
      // this there was nothing to notice: the read simply never returned and the
      // account sat in `analyzing` for the full 20 minutes with no error, no
      // progress, and no way for the user to tell it apart from a slow run.
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"phase_completed"}\n\n'))
          // …and never closes.
        },
      })
      fetchMock.mockResolvedValue(new Response(body, { status: 200 }))
      const client = new StreamClient({ baseUrl: 'https://api.test' })

      const events: unknown[] = []
      await expect(
        (async () => {
          for await (const ev of client.stream({ urlInfo: { template: '/graph/analyze' }, idleTimeoutMs: 60 })) {
            events.push(ev)
          }
        })(),
      ).rejects.toThrow(HttpTimeoutError)
      // What DID arrive before the silence is still delivered — the caller can
      // persist the phases it got and say the dossier is incomplete.
      expect(events).toEqual([{ type: 'phase_completed' }])
    })

    it('does not fire the idle timeout while keepalives keep arriving', async () => {
      const enc = new TextEncoder()
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          for (let i = 0; i < 4; i++) {
            await new Promise(r => setTimeout(r, 25))
            controller.enqueue(enc.encode(': keepalive\n\n'))
          }
          controller.enqueue(enc.encode('data: {"type":"run_completed"}\n\n'))
          controller.close()
        },
      })
      fetchMock.mockResolvedValue(new Response(body, { status: 200 }))
      const client = new StreamClient({ baseUrl: 'https://api.test' })

      const events = await collect(client.stream({ urlInfo: { template: '/graph/analyze' }, idleTimeoutMs: 200 }))

      expect(events).toEqual([{ type: 'run_completed' }])
    })

    it('cancels the underlying stream when the consumer stops reading early (#2915.1)', async () => {
      // Mirrors `runViaGraph`: the worker's `for await` throws when a phase
      // fails to persist. A `for await` loop whose body throws calls `.return()`
      // on the async generator — which resumes it at the suspended `yield`,
      // running any `finally` WITHOUT ever reaching a `catch`. Before this fix,
      // the `finally` only released the reader's lock; the underlying stream —
      // and the IA process still writing to it — was never torn down, so the
      // IA kept running (and paying for) phases nobody was going to persist.
      let cancelled = false
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const enc = new TextEncoder()
          controller.enqueue(enc.encode('data: {"type":"phase_completed","phase":"research"}\n\n'))
          controller.enqueue(enc.encode('data: {"type":"phase_completed","phase":"plan"}\n\n'))
          // Never closes — the IA keeps streaming after the consumer walks away.
        },
        cancel() {
          cancelled = true
        },
      })
      fetchMock.mockResolvedValue(new Response(body, { status: 200 }))
      const client = new StreamClient({ baseUrl: 'https://api.test' })

      await expect(
        (async () => {
          for await (const _ev of client.stream({ urlInfo: { template: '/graph/analyze' } })) {
            throw new Error('persistence failed')
          }
        })(),
      ).rejects.toThrow('persistence failed')

      expect(cancelled).toBe(true)
    })

    it('skips SSE keepalive comment frames and still yields the data frames around them', async () => {
      // The IA emits ``: keepalive\n\n`` comments during a silent gap so a proxy
      // never idle-closes a long run. They carry no ``data:`` line, so the parser
      // must skip them and surface only the real events.
      const sse =
        ': keepalive\n\n' +
        'data: {"type":"phase_completed","phase":"research"}\n\n' +
        ': keepalive\n\n' +
        'data: {"type":"run_completed","progress":100}\n\n'
      fetchMock.mockResolvedValue(new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } }))
      const client = new StreamClient({ baseUrl: 'https://api.test' })

      const events = await collect(client.stream({ urlInfo: { template: '/graph/analyze' } }))

      expect(events).toEqual([
        { type: 'phase_completed', phase: 'research' },
        { type: 'run_completed', progress: 100 },
      ])
    })

    it('ends gracefully when the connection is cut mid-frame (no throw, keeps complete frames)', async () => {
      // A truncated SSE connection ends with a partial, unterminated frame. The
      // generator must yield the frames that fully arrived and then complete
      // WITHOUT throwing — the worker decides whether the run is actually complete.
      const sse = 'data: {"type":"phase_completed","phase":"plan"}\n\n' + 'data: {"type":"run_comp' // connection dropped mid-frame — never terminated by \n\n
      fetchMock.mockResolvedValue(new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } }))
      const client = new StreamClient({ baseUrl: 'https://api.test' })

      const events = await collect(client.stream({ urlInfo: { template: '/graph/analyze' } }))

      expect(events).toEqual([{ type: 'phase_completed', phase: 'plan' }])
    })

    it('reads a response header before consuming the body (LOT STREAM — chat cost header)', async () => {
      // `request()` already exposes this for buffered calls (the per-provider
      // cost registry, `x-bellum-costs`) — a streamed call never hands its
      // `Response` object back to the caller, so without this the same
      // metadata was simply unreachable for a streamed endpoint.
      const sse = 'data: {"type":"delta","text":"Bon"}\n\n'
      fetchMock.mockResolvedValue(
        new Response(sse, {
          status: 200,
          headers: { 'content-type': 'text/event-stream', 'x-bellum-costs': 'anthropic:0.002' },
        }),
      )
      const client = new StreamClient({ baseUrl: 'https://api.test' })
      const seen: Array<[string, string | null]> = []

      const events = await collect(
        client.stream({
          urlInfo: { template: '/chat/message' },
          responseHeaderName: 'x-bellum-costs',
          onResponseHeader: (name, value) => seen.push([name, value]),
        }),
      )

      expect(events).toEqual([{ type: 'delta', text: 'Bon' }])
      expect(seen).toEqual([['x-bellum-costs', 'anthropic:0.002']])
    })

    it('never lets a broken header reader break the stream', async () => {
      const sse = 'data: {"type":"delta","text":"Bon"}\n\n'
      fetchMock.mockResolvedValue(new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } }))
      const client = new StreamClient({ baseUrl: 'https://api.test' })

      const events = await collect(
        client.stream({
          urlInfo: { template: '/chat/message' },
          responseHeaderName: 'x-bellum-costs',
          onResponseHeader: () => {
            throw new Error('reader blew up')
          },
        }),
      )

      expect(events).toEqual([{ type: 'delta', text: 'Bon' }])
    })
  })
})
