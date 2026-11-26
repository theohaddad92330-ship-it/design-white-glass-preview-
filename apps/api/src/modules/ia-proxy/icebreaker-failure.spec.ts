import { HttpError, HttpTimeoutError, TechnicalError } from '@bellum/errors'
import { classifyIcebreakerFailure, ICEBREAKER_FAILURE_MESSAGES } from './icebreaker-failure'

/**
 * #2648.1 — `IaClient.icebreaker` throws a `TechnicalError` (`@bellum/errors`,
 * via `HttpClient.request`) for EVERY failure of `/icebreaker/generate`,
 * whatever the real cause. The controller let it escape to the generic
 * exception filter, which answers a bare 500 — losing the one thing the IA
 * DID name: `insufficient_context` (422, `apps/ia/app/routers/icebreaker.py`),
 * the one case where the engine can honestly say WHY it refused. Same pattern
 * as `discover-failure.ts` / `contacts/enrichment-failure.ts` — classify the
 * real failure, never guess one.
 */
describe('classifyIcebreakerFailure (#2648.1)', () => {
  it('a 422 the IA named `insufficient_context` is read as such, message included', () => {
    const cause = new HttpError(
      422,
      JSON.stringify({
        detail: { code: 'insufficient_context', message: 'Ni poste connu ni signal récent sur ce contact.' },
      }),
      false,
      'ia:icebreaker/generate',
    )
    const failure = classifyIcebreakerFailure(new TechnicalError('HTTP request failed', { cause }))

    expect(failure.reason).toBe('insufficient_context')
    expect(failure.status).toBe(422)
    expect(failure.message).toBe('Ni poste connu ni signal récent sur ce contact.')
  })

  it('a 404 is the contact — not found or not owned', () => {
    const cause = new HttpError(404, JSON.stringify({ detail: 'Contact not found' }), false, 'ia:icebreaker/generate')
    const failure = classifyIcebreakerFailure(new TechnicalError('HTTP request failed', { cause }))

    expect(failure.reason).toBe('contact_not_found')
    expect(failure.status).toBe(404)
  })

  it('a 502 from a model failure carries no fabricated reason — upstream_error, 503', () => {
    const cause = new HttpError(502, 'boom', true, 'ia:icebreaker/generate')
    const failure = classifyIcebreakerFailure(new TechnicalError('HTTP request failed', { cause }))

    expect(failure.reason).toBe('upstream_error')
    expect(failure.status).toBe(503)
    expect(failure.message).toBe(ICEBREAKER_FAILURE_MESSAGES.upstream_error)
  })

  it('no response at all (timeout) is upstream_error too — never guessed as insufficient_context', () => {
    const cause = new HttpTimeoutError(30_000, 'ia:icebreaker/generate')
    const failure = classifyIcebreakerFailure(new TechnicalError('HTTP request aborted during backoff', { cause }))

    expect(failure.reason).toBe('upstream_error')
    expect(failure.status).toBe(503)
  })

  it('a 422 whose body carries no known code degrades to upstream_error, never insufficient_context by default', () => {
    const cause = new HttpError(422, JSON.stringify({ detail: 'validation error' }), false, 'ia:icebreaker/generate')
    const failure = classifyIcebreakerFailure(new TechnicalError('HTTP request failed', { cause }))

    expect(failure.reason).toBe('upstream_error')
  })

  it('an unrecognised error still yields a known reason — never empty', () => {
    const failure = classifyIcebreakerFailure(new Error('n’importe quoi'))
    expect(failure.reason).toBe('upstream_error')
    expect(failure.status).toBe(503)
  })
})
