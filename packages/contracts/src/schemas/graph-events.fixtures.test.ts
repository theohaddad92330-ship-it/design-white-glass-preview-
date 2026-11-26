import { describe, expect, it } from 'vitest'

import wire from '../fixtures/graph-events.ia.json' with { type: 'json' }
import { parseGraphEvent } from './graph-events.js'

/**
 * End-to-end SHAPE guard for the analysis event stream (IA → NestJS worker).
 *
 * The frames below are the RAW output of `stream_analysis_graph`, captured from
 * the real producer and pinned on the Python side by
 * `apps/ia/tests/test_graph_events_wire_contract.py`. Moving a field in either
 * language now fails the other language's suite — the same shared-artefact
 * pattern as `companies.fixtures.test.ts`, which exists because `registry_id` vs
 * `registryId` shipped broken while both suites were green, each asserting its
 * own assumption and never comparing them.
 *
 * This stream had the same disease in a worse place: `data` was
 * `z.record(z.unknown())`, so the producer and the consumer could disagree about
 * where a failure's error lived and nothing would ever object.
 */
describe('graph events — IA wire fixture', () => {
  const streams = [
    { name: 'successful run', frames: wire.run_completed },
    { name: 'failed run', frames: wire.run_failed },
  ] as const

  for (const { name, frames } of streams) {
    it(`parses every frame of a ${name}`, () => {
      for (const frame of frames) {
        const result = parseGraphEvent(frame)
        expect(result.status, `${frame.type}: ${JSON.stringify(result)}`).toBe('ok')
      }
    })
  }

  it('pins the frame sequence of a successful run', () => {
    expect(wire.run_completed.map(f => [f.type, f.phase])).toEqual([
      ['phase_completed', 'research'],
      ['phase_completed', 'contacts'],
      ['phase_completed', 'classify'],
      ['phase_completed', 'plan'],
      // `phase` is null ONLY here — the run as a whole belongs to no phase.
      ['run_completed', null],
    ])
  })

  it('pins BOTH failure frames nesting their error under data.error', () => {
    // The asymmetry that cost days of production: `phase_failed` used to splat
    // the error object flat AS `data` while `run_failed` nested it. The producer
    // was corrected (2b1d3fe1); this is what stops it drifting back unnoticed.
    const failures = wire.run_failed.filter(f => f.type === 'phase_failed' || f.type === 'run_failed')
    expect(failures).toHaveLength(2)
    for (const frame of failures) {
      const error = (frame.data as { error?: { code?: string; message?: string } }).error
      expect(error?.code, `${frame.type} must carry a greppable code`).toBeTruthy()
      expect(error?.message, `${frame.type} must name a cause`).toBeTruthy()
    }
  })

  it('carries the telemetry on the failure frame the worker actually reads', () => {
    // The asymmetry #634 pinned and this closes. `summary` used to live only on
    // the terminal `run_failed` — but the worker THROWS on `phase_failed` the
    // moment it arrives, so `run_failed` is never reached on a real failure.
    // Telemetry on the terminal frame alone was therefore telemetry no failing
    // run ever delivered, and `stampSourceHealth` was dead code on the only
    // failure path that fires. Both frames now carry it, so the "which source
    // broke" screen has data whichever one the consumer reaches first.
    const phaseFailed = wire.run_failed.find(f => f.type === 'phase_failed')
    const runFailed = wire.run_failed.find(f => f.type === 'run_failed')
    expect(Object.keys(phaseFailed?.data ?? {}).sort()).toEqual(['error', 'summary'])
    expect(Object.keys(runFailed?.data ?? {}).sort()).toEqual(['error', 'summary'])
  })

  it('reports the same health data on both failure frames', () => {
    // If the two disagreed, "which upstream is down" would depend on a race
    // between the worker's throw and the stream's final flush.
    const summaryOf = (type: string) =>
      (wire.run_failed.find(f => f.type === type)?.data as { summary?: Record<string, unknown> }).summary
    expect(summaryOf('phase_failed')).toEqual(summaryOf('run_failed'))
  })

  it('still parses a phase_failed from an IA deploy that predates the summary', () => {
    // Deployment order between the two Railway services is not guaranteed. An
    // older IA omits the key entirely; that must stay a valid frame, because the
    // consumer's answer to a missing summary is "unknown" — never a fabricated
    // clean bill of health.
    const legacy = {
      type: 'phase_failed',
      phase: 'classify',
      progress: 75,
      data: { error: { phase: 'classify', code: 'CLASSIFY_TERMINAL', message: '400 temperature is deprecated' } },
    }
    expect(parseGraphEvent(legacy).status).toBe('ok')
  })

  it('carries the keys the worker actually reaches for', () => {
    // `persistGraphPhase` reads `data.output` (the dossier) and `data.telemetry`
    // (the cost); `parseRunCostSummary` reads `data.summary.*`. If any of these
    // moved, the worker would persist an empty dossier or bill zero — silently,
    // which is how this whole class of bug hides.
    for (const frame of wire.run_completed) {
      if (frame.type !== 'phase_completed') continue
      const data = frame.data as Record<string, unknown>
      expect(Object.keys(data).sort()).toEqual(['output', 'telemetry'])
    }
    const terminal = wire.run_completed.at(-1)
    const summary = (terminal?.data as { summary?: Record<string, unknown> }).summary ?? {}
    for (const key of ['total_cost_usd', 'total_llm_cost_usd', 'providers', 'degraded_sources', 'phases']) {
      expect(summary, `summary.${key} feeds run-cost.ts`).toHaveProperty(key)
    }
  })
})
