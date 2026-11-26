/**
 * What one analysis actually cost, and where the time went.
 *
 * The billing screen reported ~$1.11 per analysis. That figure was Claude
 * tokens and nothing else — Apollo credits, Firecrawl page credits, Pappers
 * lookups and the paid search providers were invisible, so the cost was
 * understated and nobody could see which provider was expensive.
 *
 * The IA graph now emits the full picture on its terminal event
 * (`builder.summarize_telemetry`): `total_cost_usd` (LLM + every paid call),
 * `total_llm_cost_usd` (the previous number, kept so a regression in either
 * half stays visible), a per-provider breakdown and the degraded sources.
 *
 * This module parses that payload defensively. Two rules drive every choice:
 *
 * 1. **Never invent a cost.** A malformed or missing figure becomes `null` and
 *    the caller falls back to what it accumulated per phase — a customer's
 *    invoice must never be built on a guessed number, and `NaN` must never
 *    reach the database.
 * 2. **Never drop a free provider.** BODACC costs no money but its calls are
 *    where the minutes went, and latency is the other half of the question.
 */

import type { RunDegradedSource, RunSourceHealth } from '../../database/entities/analysis-run.entity'

/** One provider's contribution to a run. `costUsd` is 0 for free sources. */
type RunProviderCost = {
  provider: string
  calls: number
  errors: number
  durationMs: number
  waitMs: number
  costUsd: number
  unitCostUsd: number
}

export type RunCostBreakdown = {
  /** LLM + every paid provider call. `null` when the IA payload predates it. */
  totalCostUsd: number | null
  /** LLM tokens only — what the dashboard used to show on its own. */
  llmCostUsd: number | null
  /** Per provider, most expensive first. */
  providers: RunProviderCost[]
  /**
   * Whether the payload carried a `total_cost_usd` key at all.
   *
   * Distinguishes an OLD IA deploy (no such key — its LLM total is the best
   * figure available) from a CURRENT one that failed to compute a total. In the
   * second case falling back to the LLM number would quietly under-bill, hiding
   * exactly the provider spend this work exists to surface, so we prefer the
   * worker's own accumulator.
   */
  reportsTotalCost: boolean
  degradedSources: RunDegradedSource[]
  /** Per-run source health, ready to persist on the append-only run history. */
  sourceHealth: RunSourceHealth
}

/** A money/duration figure we are willing to persist: finite and non-negative. */
function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function count(value: unknown): number {
  return finiteNonNegative(value) ?? 0
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseProviders(raw: unknown): RunProviderCost[] {
  const entries = asRecord(raw)
  if (!entries) return []

  const providers: RunProviderCost[] = []
  for (const [provider, metric] of Object.entries(entries)) {
    const row = asRecord(metric)
    // A nameless or non-object entry is corrupt. Skipping beats materialising a
    // zero row that would read as "this provider ran and cost nothing".
    if (!provider.trim() || !row) continue
    providers.push({
      provider,
      calls: count(row.calls),
      errors: count(row.errors),
      durationMs: count(row.duration_ms),
      waitMs: count(row.wait_ms),
      costUsd: count(row.cost_usd),
      unitCostUsd: count(row.unit_cost_usd),
    })
  }
  // Most expensive first: the reason to open this breakdown is "what did we pay
  // for", and a stable secondary key keeps two identical runs rendering alike.
  return providers.sort((a, b) => b.costUsd - a.costUsd || a.provider.localeCompare(b.provider))
}

function parseDegradedSources(raw: unknown): RunDegradedSource[] {
  if (!Array.isArray(raw)) return []
  const out: RunDegradedSource[] = []
  for (const entry of raw) {
    const row = asRecord(entry)
    const source = typeof row?.source === 'string' ? row.source.trim() : ''
    // A reason without a source names nothing actionable — drop it.
    if (!source) continue
    // `code` is the IA's machine-readable cause (`quota_exceeded`,
    // `unauthorized`…). It is what lets the source-health screen group and count
    // failures; free-text `reason` cannot be aggregated. Kept optional: an
    // unclassified degradation must not pass for a classified one.
    const code = typeof row?.code === 'string' ? row.code.trim() : ''
    out.push({
      source,
      reason: typeof row?.reason === 'string' ? row.reason : '',
      ...(code ? { code } : {}),
    })
  }
  return out
}

/**
 * The sources this run actually CALLED, from the per-provider counters.
 *
 * Needed to tell "the source answered fine" from "no run touched the source".
 * Without it, a health screen cannot distinguish a working provider from an
 * idle one, and would have to guess — which is how a green dashboard ends up
 * sitting on top of a dead API.
 */
function observedSources(providers: RunProviderCost[]): string[] {
  return providers.filter(p => p.calls > 0).map(p => p.provider)
}

/**
 * Read the cost breakdown off a terminal graph event's `data`.
 *
 * Returns `null` when the event carries no summary, or a summary with none of
 * the cost keys — an older IA deploy — so the caller can tell "no cost reported"
 * apart from "cost reported as zero".
 */
export function parseRunCostSummary(data: unknown): RunCostBreakdown | null {
  const summary = asRecord(asRecord(data)?.summary)
  if (!summary) return null

  const hasCostKeys =
    'total_cost_usd' in summary ||
    'total_llm_cost_usd' in summary ||
    'providers' in summary ||
    'degraded_sources' in summary
  if (!hasCostKeys) return null

  const providers = parseProviders(summary.providers)
  const degradedSources = parseDegradedSources(summary.degraded_sources)
  return {
    totalCostUsd: finiteNonNegative(summary.total_cost_usd),
    llmCostUsd: finiteNonNegative(summary.total_llm_cost_usd),
    providers,
    degradedSources,
    sourceHealth: { degraded: degradedSources, observed: observedSources(providers) },
    reportsTotalCost: 'total_cost_usd' in summary,
  }
}

/**
 * The figure to bill for this run.
 *
 * Preference order: the full cost → the LLM-only total → whatever the worker
 * accumulated per phase. The fallbacks matter because a missing field must
 * never silently zero a customer's cost, and a broken accumulator must never
 * write `NaN`.
 */
export function resolveRunCostUsd(breakdown: RunCostBreakdown | null, accumulatedUsd: number): number {
  if (breakdown?.totalCostUsd !== null && breakdown?.totalCostUsd !== undefined) return breakdown.totalCostUsd
  // Only a payload with no `total_cost_usd` key at all is old enough that its
  // LLM figure is the best we have. A current payload whose total came back
  // unusable falls through to the accumulator rather than under-billing.
  if (breakdown && !breakdown.reportsTotalCost && breakdown.llmCostUsd !== null) return breakdown.llmCostUsd
  return finiteNonNegative(accumulatedUsd) ?? 0
}
