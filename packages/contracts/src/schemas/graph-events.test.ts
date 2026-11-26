import { describe, expect, it } from 'vitest'

import { GraphEventContractError, parseGraphEvent } from './graph-events.js'

/**
 * The boundary this file guards is the one that lost a production outage.
 *
 * `apps/ia/app/graph/builder.py` and the NestJS worker disagreed about where a
 * failure's error object lives — `phase_failed` splatted it flat AS `data`,
 * `run_failed` nested it UNDER `data.error` — and the worker knew only the
 * nested shape. Every `phase_failed` therefore read `undefined`, fell through a
 * `??` to the literal string `` `${phase} failed` ``, and a hard Anthropic 400
 * ("'temperature' is deprecated for this model") reached the customer as the
 * word "Erreur".
 *
 * Nothing failed at the frontier, because `data` was typed `z.record(z.unknown())`
 * — an opaque bag that accepts every shape equally. The mismatch surfaced seven
 * layers downstream as a missing sentence.
 *
 * These tests assert the two halves of the replacement policy:
 *   - a KNOWN event with a malformed payload dies HERE, naming event and field;
 *   - an UNKNOWN event type is reported and skipped, never thrown.
 */
describe('parseGraphEvent', () => {
  const errorPayload = { phase: 'research', code: 'CLAUDE_BAD_REQUEST', message: "'temperature' is deprecated" }

  describe('the shape that caused the outage', () => {
    // The producer was corrected (commit 2b1d3fe1) to nest `phase_failed`'s
    // error like `run_failed` already did. Accepting the FLAT shape too is not
    // nostalgia: the API and the IA are separate Railway services with no
    // ordering guarantee, so an IA rolled back below that commit still emits it.
    // #628 chose consumer-side tolerance precisely so neither side has to wait
    // for the other to deploy. This test pins that property.
    it('accepts the legacy FLAT phase_failed (error object AS data)', () => {
      const result = parseGraphEvent({ type: 'phase_failed', phase: 'research', progress: 25, data: errorPayload })

      expect(result.status).toBe('ok')
    })

    it('accepts the current NESTED phase_failed (error object UNDER data.error)', () => {
      const result = parseGraphEvent({
        type: 'phase_failed',
        phase: 'research',
        progress: 25,
        data: { error: errorPayload },
      })

      expect(result.status).toBe('ok')
    })
  })

  describe('a malformed KNOWN event dies at the frontier', () => {
    it('rejects a failure event whose error names no cause, naming event and field', () => {
      // The exact corruption the old schema waved through: a failure event
      // carrying no readable message. Downstream this became "research failed".
      let caught: unknown
      try {
        parseGraphEvent({ type: 'phase_failed', phase: 'research', data: { error: { phase: 'research' } } })
      } catch (err) {
        caught = err
      }

      expect(caught).toBeInstanceOf(GraphEventContractError)
      const err = caught as GraphEventContractError
      // The two facts an on-call engineer needs, in the message itself.
      expect(err.eventType).toBe('phase_failed')
      expect(err.message).toContain('phase_failed')
      expect(err.message).toContain('data.error.message')
    })

    it('rejects a phase_completed whose output is not an object', () => {
      // `persistGraphPhase` casts `data.output` to a record and reads the
      // dossier off it. A string here silently persists NOTHING while the phase
      // is marked done — the dossier arrives empty and nobody is told.
      expect(() =>
        parseGraphEvent({ type: 'phase_completed', phase: 'research', progress: 25, data: { output: 'oops' } }),
      ).toThrow(GraphEventContractError)
    })

    it('rejects a phase_completed with no output at all', () => {
      expect(() => parseGraphEvent({ type: 'phase_completed', phase: 'plan', progress: 100, data: {} })).toThrow(
        /data\.output/,
      )
    })

    it('rejects a frame whose type is missing or not a string (corrupt, not new)', () => {
      // Distinct from an unknown type: there is no event here at all.
      expect(() => parseGraphEvent({ phase: 'research', data: {} })).toThrow(GraphEventContractError)
      expect(() => parseGraphEvent({ type: 42, data: {} })).toThrow(GraphEventContractError)
    })
  })

  describe('an UNKNOWN event type degrades instead of failing the run', () => {
    // Deployment order between the API and the IA is not guaranteed. If a new
    // event type threw here it would throw MID-STREAM, after phases had already
    // been persisted, as a plain error that rides the BullMQ retry budget — so
    // every account would re-run the whole expensive pipeline and hit the same
    // frame again. The codebase already had a near-miss of exactly this: the
    // comment on `judge_completed` in `ia.client.ts` warns that omitting it from
    // the enum "would make parse throw on that frame and fail an already-completed
    // run". An event we cannot interpret carries nothing we would have used.
    it('reports an unrecognised type rather than throwing', () => {
      const result = parseGraphEvent({ type: 'phase_progress', phase: 'research', data: { pct: 12 } })

      expect(result.status).toBe('unknown_type')
      expect(result.status === 'unknown_type' && result.type).toBe('phase_progress')
    })

    it('does not let an unknown type smuggle in a malformed known one', () => {
      // Tolerance is scoped to the discriminator alone.
      expect(() => parseGraphEvent({ type: 'run_failed', data: { error: { code: '' } } })).toThrow(
        GraphEventContractError,
      )
    })
  })

  describe('tolerance where loss is visible, strictness where it is silent', () => {
    it('passes unknown payload keys THROUGH rather than stripping them', () => {
      // zod strips unknown keys by default, and `data.output` is handed WHOLESALE
      // to the persistence layer. Stripping would silently drop any field the IA
      // adds — which is the `registry_id` / `registryId` bug class this repo has
      // already paid for once. Neither reject nor drop: carry it.
      const result = parseGraphEvent({
        type: 'phase_completed',
        phase: 'research',
        progress: 25,
        data: { telemetry: {}, output: { research: { brandNewFieldFromTheIa: 'kept' } } },
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      const output = result.event.data.output as { research: Record<string, unknown> }
      expect(output.research.brandNewFieldFromTheIa).toBe('kept')
    })

    it('tolerates a missing telemetry summary (metrics degrade, the dossier does not)', () => {
      // `run-cost.ts` documents that a summary-less terminal means "an older IA
      // deploy" and returns null for it. Failing the run over absent telemetry
      // would throw away a COMPLETE dossier to protect a dashboard.
      expect(parseGraphEvent({ type: 'run_completed', progress: 100, data: {} }).status).toBe('ok')
      expect(parseGraphEvent({ type: 'judge_completed', phase: 'judge', data: {} }).status).toBe('ok')
    })

    it('accepts the events the producer actually emits, with their real shapes', () => {
      const summary = { total_cost_usd: 1.23, providers: [], degraded_sources: [] }
      const frames = [
        { type: 'phase_completed', phase: 'research', progress: 25, data: { telemetry: {}, output: { research: {} } } },
        { type: 'phase_skipped', phase: 'contacts', progress: 50, data: {} },
        { type: 'phase_failed', phase: 'classify', progress: 75, data: { error: errorPayload } },
        { type: 'judge_completed', phase: 'judge', progress: 100, data: { judge: { verdict: 'flagged' } } },
        { type: 'run_failed', phase: 'research', progress: 25, data: { error: errorPayload, summary } },
        { type: 'run_skipped', phase: 'research', progress: 25, data: { gate: { decision: 'no_go' }, summary } },
        { type: 'run_completed', phase: null, progress: 100, data: { summary } },
      ]

      for (const frame of frames) {
        const result = parseGraphEvent(frame)
        expect(result.status, `${frame.type} should parse: ${JSON.stringify(result)}`).toBe('ok')
      }
    })
  })
})
