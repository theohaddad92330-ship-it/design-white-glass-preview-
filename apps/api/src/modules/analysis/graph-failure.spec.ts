import type { GraphFailureData } from '@bellum/contracts'
import { describeGraphFailure } from './graph-failure'

/**
 * The regression this file exists for.
 *
 * Anthropic dropped `temperature` on Sonnet 5. Every analysis died in ~2s with a
 * hard 400. The cause travelled four layers intact — `Claude API error: 400 …
 * temperature` → `HTTPException(502)` → `_fail("research", …)` → the
 * `phase_failed` event — and then evaporated, because the reader looked for the
 * error under `data.error` while `phase_failed` puts it AT `data`. The `??`
 * fallback turned `undefined` into "research failed", and that string is what
 * the operator and the customer saw for days.
 *
 * Two rules follow, and every test below pins one of them:
 *  1. read BOTH shapes — the two terminal events disagree on the wire, and a
 *     reader that only understands one of them is a silent reader;
 *  2. never drop `code` — "research failed" is not diagnosable, but
 *     `CLAUDE_BAD_REQUEST` is one grep away from the answer.
 */
describe('describeGraphFailure', () => {
  // ── The exact outage ───────────────────────────────────────────────────────

  it('reads the FLAT phase_failed shape that produced "research failed"', () => {
    // builder.py emits `data=update["error"]` for phase_failed — the error IS data.
    const detail = describeGraphFailure(
      { phase: 'research', code: 'CLAUDE_BAD_REQUEST', message: 'Claude API error: 400 temperature unsupported' },
      'research',
    )

    expect(detail).toContain('temperature')
    expect(detail).toContain('CLAUDE_BAD_REQUEST')
    expect(detail).not.toBe('research failed')
  })

  it('reads the NESTED run_failed shape', () => {
    // builder.py emits `data={"error": …, "summary": …}` for run_failed.
    const detail = describeGraphFailure({ error: { message: 'credit balance too low' } }, 'classify')

    expect(detail).toContain('credit balance too low')
  })

  it('keeps the code alongside the message on the nested shape too', () => {
    const detail = describeGraphFailure(
      { error: { code: 'FIRECRAWL_CREDITS_EXHAUSTED', message: 'out of scrape credits' } },
      'research',
    )

    expect(detail).toContain('FIRECRAWL_CREDITS_EXHAUSTED')
    expect(detail).toContain('out of scrape credits')
  })

  // ── The user-facing sentence, when the graph bothered to write one ──────────

  it('surfaces user_message when the typed error carries one', () => {
    const detail = describeGraphFailure(
      {
        code: 'CLAUDE_OUTPUT_TRUNCATED',
        message: 'max_tokens reached',
        user_message: "L'analyse a été coupée avant la fin.",
      },
      'plan',
    )

    expect(detail).toContain("L'analyse a été coupée avant la fin.")
    expect(detail).toContain('CLAUDE_OUTPUT_TRUNCATED')
  })

  it('accepts the camelCase spelling too (the TS side of the contract)', () => {
    const detail = describeGraphFailure({ code: 'X_FAILED', userMessage: 'Message lisible' }, 'plan')

    expect(detail).toContain('Message lisible')
  })

  // ── Honest degradation: say what we have, never invent ──────────────────────

  it('falls back to the phase label ONLY when the payload names no cause', () => {
    expect(describeGraphFailure({}, 'research')).toBe('research failed')
  })

  it('falls back to "graph failed" when even the phase is unknown', () => {
    expect(describeGraphFailure(junk(undefined), undefined)).toBe('graph failed')
  })

  it('reports a lone code when there is no message — a code beats a generic label', () => {
    expect(describeGraphFailure({ code: 'CLAUDE_BAD_REQUEST' }, 'research')).toContain('CLAUDE_BAD_REQUEST')
  })

  it('reports a lone message when there is no code', () => {
    expect(describeGraphFailure({ message: 'boom' }, 'research')).toContain('boom')
  })

  it('does not repeat the code when the message already contains it', () => {
    const detail = describeGraphFailure({ code: 'BOOM', message: 'BOOM: everything is on fire' }, 'research')

    expect(detail.match(/BOOM/g)).toHaveLength(1)
  })

  // ── Defence in depth, BELOW the contract ────────────────────────────────────
  //
  // The event boundary now rejects these payloads before they can reach this
  // function, so the casts below deliberately construct values the type system
  // forbids. They are kept rather than deleted: this is the function that turned
  // a hard Anthropic 400 into the word "Erreur", and one layer of validation is
  // exactly as many as the code had when that happened. If a future refactor
  // ever routes an unvalidated payload here again, these keep the failure
  // legible instead of rendering "[object Object]" to a customer.
  const junk = (value: unknown): GraphFailureData => value as GraphFailureData

  it('survives a non-object payload', () => {
    expect(describeGraphFailure(junk('nope'), 'research')).toBe('research failed')
    expect(describeGraphFailure(junk(null), 'research')).toBe('research failed')
    expect(describeGraphFailure(junk([1, 2]), 'research')).toBe('research failed')
  })

  it('ignores non-string fields rather than rendering [object Object]', () => {
    const detail = describeGraphFailure(junk({ code: { nope: true }, message: 42 }), 'research')

    expect(detail).toBe('research failed')
    expect(detail).not.toContain('object')
  })

  it('caps a pathological message instead of throwing a novel into the banner', () => {
    const detail = describeGraphFailure({ message: 'x'.repeat(5000) }, 'research')

    expect(detail.length).toBeLessThanOrEqual(600)
  })
})
