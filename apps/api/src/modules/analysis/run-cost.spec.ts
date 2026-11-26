import { parseRunCostSummary, resolveRunCostUsd } from './run-cost'

// The wire shape of a terminal graph event's ``data`` (apps/ia
// ``builder.summarize_telemetry``): the full run cost, the LLM-only figure it
// replaces, the per-provider breakdown and the degraded sources.
function summaryData(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    summary: {
      total_cost_usd: 1.53,
      total_llm_cost_usd: 1.11,
      providers: {
        claude: { calls: 4, errors: 0, duration_ms: 42_000, wait_ms: 300, cost_usd: 1.11, unit_cost_usd: 0 },
        apollo: { calls: 12, errors: 1, duration_ms: 9_000, wait_ms: 1_200, cost_usd: 0.22, unit_cost_usd: 0.02 },
        firecrawl: { calls: 7, errors: 0, duration_ms: 31_000, wait_ms: 0, cost_usd: 0.007, unit_cost_usd: 0.001 },
      },
      degraded_sources: [{ source: 'pappers', reason: 'quota dépassé' }],
      ...over,
    },
  }
}

describe('parseRunCostSummary', () => {
  it('reads the full run cost, the LLM-only figure and the per-provider breakdown', () => {
    const breakdown = parseRunCostSummary(summaryData())

    expect(breakdown).not.toBeNull()
    expect(breakdown?.totalCostUsd).toBeCloseTo(1.53, 6)
    expect(breakdown?.llmCostUsd).toBeCloseTo(1.11, 6)
    expect(breakdown?.providers).toEqual([
      { provider: 'claude', calls: 4, errors: 0, durationMs: 42_000, waitMs: 300, costUsd: 1.11, unitCostUsd: 0 },
      { provider: 'apollo', calls: 12, errors: 1, durationMs: 9_000, waitMs: 1_200, costUsd: 0.22, unitCostUsd: 0.02 },
      {
        provider: 'firecrawl',
        calls: 7,
        errors: 0,
        durationMs: 31_000,
        waitMs: 0,
        costUsd: 0.007,
        unitCostUsd: 0.001,
      },
    ])
    expect(breakdown?.degradedSources).toEqual([{ source: 'pappers', reason: 'quota dépassé' }])
  })

  it('ranks providers by spend so the most expensive one reads first', () => {
    const providers = parseRunCostSummary(summaryData())?.providers ?? []
    expect(providers.map(p => p.provider)).toEqual(['claude', 'apollo', 'firecrawl'])
  })

  it('returns null when the event carries no summary at all', () => {
    expect(parseRunCostSummary({})).toBeNull()
    expect(parseRunCostSummary({ summary: null })).toBeNull()
    expect(parseRunCostSummary(undefined)).toBeNull()
  })

  it('returns null on a legacy summary with none of the cost keys', () => {
    expect(parseRunCostSummary({ summary: { total_input_tokens: 1000, phases: [] } })).toBeNull()
  })

  it('keeps a legacy summary usable through its LLM-only total', () => {
    const breakdown = parseRunCostSummary({ summary: { total_llm_cost_usd: 0.81 } })
    expect(breakdown?.totalCostUsd).toBeNull()
    expect(breakdown?.llmCostUsd).toBeCloseTo(0.81, 6)
    expect(breakdown?.providers).toEqual([])
  })

  it('ignores a non-finite or negative total rather than persisting NaN', () => {
    expect(parseRunCostSummary(summaryData({ total_cost_usd: 'beaucoup' }))?.totalCostUsd).toBeNull()
    expect(parseRunCostSummary(summaryData({ total_cost_usd: -3 }))?.totalCostUsd).toBeNull()
    expect(parseRunCostSummary(summaryData({ total_cost_usd: Number.NaN }))?.totalCostUsd).toBeNull()
  })

  it('drops malformed provider entries instead of inventing zeros for them', () => {
    const breakdown = parseRunCostSummary(
      summaryData({ providers: { apollo: { calls: 3, cost_usd: 0.06 }, brave: 'nope', '': { calls: 1 } } }),
    )
    expect(breakdown?.providers).toEqual([
      { provider: 'apollo', calls: 3, errors: 0, durationMs: 0, waitMs: 0, costUsd: 0.06, unitCostUsd: 0 },
    ])
  })

  it('keeps a free provider at cost 0 — its calls still prove where the minutes went', () => {
    const breakdown = parseRunCostSummary(
      summaryData({ providers: { bodacc: { calls: 5, errors: 0, duration_ms: 900, cost_usd: 0, unit_cost_usd: 0 } } }),
    )
    expect(breakdown?.providers).toEqual([
      { provider: 'bodacc', calls: 5, errors: 0, durationMs: 900, waitMs: 0, costUsd: 0, unitCostUsd: 0 },
    ])
  })

  it('keeps only well-formed degraded sources', () => {
    const breakdown = parseRunCostSummary(
      summaryData({ degraded_sources: [{ source: 'apollo', reason: '429' }, { reason: 'orpheline' }, 'nope'] }),
    )
    expect(breakdown?.degradedSources).toEqual([{ source: 'apollo', reason: '429' }])
  })
})

describe('resolveRunCostUsd', () => {
  it('bills the full cost (LLM + paid providers) when the graph reports one', () => {
    expect(resolveRunCostUsd(parseRunCostSummary(summaryData()), 1.11)).toBeCloseTo(1.53, 6)
  })

  it('falls back to the LLM-only total on an older IA payload', () => {
    expect(resolveRunCostUsd(parseRunCostSummary({ summary: { total_llm_cost_usd: 0.81 } }), 0.4)).toBeCloseTo(0.81, 6)
  })

  it('falls back to the accumulated per-phase cost when no summary arrived — never 0', () => {
    expect(resolveRunCostUsd(null, 0.81)).toBeCloseTo(0.81, 6)
    expect(resolveRunCostUsd(parseRunCostSummary(summaryData({ total_cost_usd: null })), 0.81)).toBeCloseTo(0.81, 6)
  })

  it('never lets a broken accumulator write NaN', () => {
    expect(resolveRunCostUsd(null, Number.NaN)).toBe(0)
  })
})
