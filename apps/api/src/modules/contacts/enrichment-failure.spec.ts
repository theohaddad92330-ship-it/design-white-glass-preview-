import { HttpError, HttpRetriesExhaustedError, HttpTimeoutError, TechnicalError } from '@bellum/errors'
import { classifyEnrichmentFailure } from './enrichment-failure'

/**
 * The report: a seller clicked « Enrichir » on a real contact and read
 *
 *   Échec de l'enrichissement de Gilles Denoyel
 *   API error
 *
 * « API error » is `extractError`'s last-resort fallback in `apps/web/src/lib/api.ts` —
 * it only fires when the response body carries no message at all. The server had
 * failed in a way that produced no reason, and the absence of information was
 * rendered as information (in English, in a French UI).
 *
 * This suite pins the translation step that was missing: an IA failure arrives
 * as a `TechnicalError` wrapping an `HttpError`, and it must come out as a
 * machine-readable reason from the shared `DegradeReason` vocabulary — never as
 * silence.
 */
describe('classifyEnrichmentFailure', () => {
  /** How the IA reports a failure since this PR: `{message, code, provider}` under `detail`. */
  const iaBody = (code: string, message = 'boom'): string =>
    JSON.stringify({ detail: { message, code, provider: 'apollo' } })

  /** Exactly how `HttpClient` wraps a non-retryable upstream status. */
  const wrapped = (status: number, body: string): TechnicalError =>
    new TechnicalError('HTTP request failed', { cause: new HttpError(status, body, false, '/phase/2/enrich') })

  describe('the reason the IA named wins', () => {
    // These four are the whole point. A dead credential, an exhausted quota, a
    // throttle and a genuine provider outage have four different repairs — and
    // before this change they were four identical toasts saying "API error".
    it.each([
      ['unauthorized', 'the Apollo key is rejected'],
      ['quota_exceeded', 'the Apollo plan/credits ran out'],
      ['rate_limited', 'we are being throttled'],
      ['missing_api_key', 'no key is configured at all'],
      ['network_error', 'Apollo was unreachable'],
      ['upstream_error', 'Apollo answered 5xx'],
    ])('surfaces %s (%s)', (code, _why) => {
      expect(classifyEnrichmentFailure(wrapped(502, iaBody(code))).reason).toBe(code)
    })

    it('keeps the upstream message as operator detail', () => {
      const out = classifyEnrichmentFailure(wrapped(502, iaBody('unauthorized', 'Apollo unauthorized [HTTP 401]')))
      expect(out.detail).toContain('Apollo unauthorized')
    })

    it('reads through a retries-exhausted wrapper', () => {
      // A 502 is retryable, so three attempts produce this nesting instead. The
      // cause chain is two levels deep here — a walk that stopped at the first
      // level would silently lose the reason on exactly the transient failures.
      const err = new TechnicalError('HTTP request failed', {
        cause: new HttpRetriesExhaustedError(3, '/phase/2/enrich', {
          cause: new HttpError(502, iaBody('rate_limited'), true, '/phase/2/enrich'),
        }),
      })
      expect(classifyEnrichmentFailure(err).reason).toBe('rate_limited')
    })
  })

  describe('when the IA said nothing usable', () => {
    // The honest-vagueness rule (#638): we know the call failed, not why.
    // Inventing a precise cause would be worse than admitting it.
    it('falls back to the HTTP status when the body has no code', () => {
      expect(classifyEnrichmentFailure(wrapped(401, '{}')).reason).toBe('unauthorized')
      expect(classifyEnrichmentFailure(wrapped(429, '')).reason).toBe('rate_limited')
      expect(classifyEnrichmentFailure(wrapped(500, 'oops')).reason).toBe('upstream_error')
    })

    it('survives a non-JSON body — the 504-from-a-proxy shape', () => {
      // A gateway timeout returns an HTML page. This is the case that produced
      // "API error" verbatim: JSON.parse throws, and the old code had nothing else.
      const html = '<html><head><title>504 Gateway Time-out</title></head></html>'
      expect(classifyEnrichmentFailure(wrapped(504, html)).reason).toBe('upstream_error')
    })

    it('reports a timeout as a network error, not as an upstream refusal', () => {
      const err = new TechnicalError('HTTP request failed', {
        cause: new HttpTimeoutError(30_000, '/phase/2/enrich'),
      })
      expect(classifyEnrichmentFailure(err).reason).toBe('network_error')
    })

    it('never returns an empty reason, whatever it is handed', () => {
      // The invariant that makes "API error" unreachable from this endpoint.
      for (const junk of [null, undefined, 'a string', 42, {}, new Error('bare')]) {
        expect(classifyEnrichmentFailure(junk).reason).toBeTruthy()
      }
    })
  })

  describe('an unparseable code is not trusted', () => {
    it('ignores a code outside the shared vocabulary', () => {
      // Guards against the IA (or a proxy) inventing a code the web cannot
      // translate — which would put us straight back to an untranslated string.
      expect(classifyEnrichmentFailure(wrapped(502, iaBody('banana'))).reason).toBe('upstream_error')
    })
  })
})
