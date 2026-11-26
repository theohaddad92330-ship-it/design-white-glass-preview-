import { HttpError, HttpRetriesExhaustedError, HttpTimeoutError, TechnicalError } from '@bellum/errors'
import { classifyDiscoverFailure, DISCOVER_FAILURE_MESSAGES } from './discover-failure'

/**
 * #2496 — `IaClient.discoverRegistry`/`discoverSignals` throw a `TechnicalError`
 * for every IA failure (`HttpClient.request`, `@bellum/http`). This classifier
 * is what turns that opaque wrapper back into a fact: did the IA answer with a
 * refused request (4xx), a real outage (5xx), or did it never answer at all
 * (timeout)? Same pattern as `contacts/enrichment-failure.ts`.
 */
describe('classifyDiscoverFailure (#2496)', () => {
  it('a 4xx from the IA is a refused input, never a 500 — status 422', () => {
    const cause = new HttpError(
      422,
      '{"detail":"naf_code must look like 62, 62.02 or 62.02A"}',
      false,
      'ia:discover/registry',
    )
    const failure = classifyDiscoverFailure(new TechnicalError('HTTP request failed', { cause }))

    expect(failure.reason).toBe('invalid_filters')
    expect(failure.status).toBe(422)
    expect(failure.message).toBe(DISCOVER_FAILURE_MESSAGES.invalid_filters)
  })

  it('a 5xx from the IA is an upstream outage, never our own 500 — status 503', () => {
    const cause = new HttpError(500, 'boom', true, 'ia:discover/registry')
    const failure = classifyDiscoverFailure(new TechnicalError('HTTP request failed', { cause }))

    expect(failure.reason).toBe('upstream_error')
    expect(failure.status).toBe(503)
  })

  it('no response at all (timeout) is a distinct fact from a refused request', () => {
    const cause = new HttpTimeoutError(45_000, 'ia:discover/registry')
    const failure = classifyDiscoverFailure(new TechnicalError('HTTP request aborted during backoff', { cause }))

    expect(failure.reason).toBe('timeout')
    expect(failure.status).toBe(503)
  })

  it('a retry budget exhausted on a transient failure is also a timeout, not upstream_error', () => {
    const cause = new HttpRetriesExhaustedError(3, 'ia:discover/registry')
    const failure = classifyDiscoverFailure(new TechnicalError('HTTP request failed', { cause }))

    expect(failure.reason).toBe('timeout')
  })

  it('an actual HTTP response always wins over a missing one, even nested deeper', () => {
    // HttpClient nests two deep on a retried call: TechnicalError →
    // HttpRetriesExhaustedError → HttpError. A 422 IS a response — it must not
    // be read as a timeout just because it sits behind the retry wrapper.
    const httpError = new HttpError(422, 'bad filters', false, 'ia:discover/registry')
    const retries = new HttpRetriesExhaustedError(3, 'ia:discover/registry', { cause: httpError })
    const failure = classifyDiscoverFailure(new TechnicalError('HTTP request failed', { cause: retries }))

    expect(failure.reason).toBe('invalid_filters')
  })

  it('an unrecognised error still yields a known reason — never empty', () => {
    const failure = classifyDiscoverFailure(new Error('n’importe quoi'))
    expect(failure.reason).toBe('upstream_error')
    expect(failure.status).toBe(503)
  })

  it('the detail carries the upstream body for operator logs, truncated', () => {
    const cause = new HttpError(422, 'x'.repeat(500), false, 'ia:discover/registry')
    const failure = classifyDiscoverFailure(new TechnicalError('HTTP request failed', { cause }))
    expect(failure.detail?.length).toBeLessThanOrEqual(200)
  })
})
