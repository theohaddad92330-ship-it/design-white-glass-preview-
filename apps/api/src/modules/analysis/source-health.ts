/**
 * "Is one of the bricks broken, and since when?"
 *
 * The degradations were always being recorded — `record_degradation(source,
 * reason)` sits in ~30 `except` blocks across the IA service, and the graph
 * publishes them on its terminal event. Nothing ever aggregated them, so the
 * only way to learn that Pappers had been dead for hours was to open a dossier
 * and find it empty.
 *
 * This module turns per-run records into a per-source status. Three rules run
 * through every line of it, because getting them wrong would produce a screen
 * that is worse than no screen at all:
 *
 * 1. **"No data" is not "source down".** Only a recorded degradation — an
 *    exception, a refusal, a non-2xx — counts as evidence of trouble. A source
 *    that answered "I have nothing for this company" is working perfectly.
 *    This is why the count-based `source_health` tristate the research phase
 *    derives (`_derive_source_health`, which maps "0 results" to DOWN and says
 *    so in its own docstring) is deliberately NOT an input here.
 *
 * 2. **Silence is not health.** A source is only rated on runs that actually
 *    exercised it. No runs, no verdict — the caller gets an empty report and
 *    must say "unknown", never "operational".
 *
 * 3. **No invented history.** `degradedSince` is read off real run timestamps.
 *    When the failing streak reaches the oldest run we can see,
 *    `degradedSinceIsWindowEdge` says so: the honest claim is "at least since",
 *    because the outage may predate everything in the window.
 */

import type { RunSourceHealth } from '../../database/entities/analysis-run.entity'

/** One run's contribution: when it ran, and what it saw. */
export type SourceHealthRun = {
  createdAt: Date
  sourceHealth: RunSourceHealth | null
}

/**
 * - `ok`       — exercised, and the most recent run that touched it succeeded.
 * - `degraded` — currently failing, but it has succeeded within the window.
 * - `down`     — every run that touched it in the window degraded it.
 * - `unknown`  — reserved for the caller: no evidence either way.
 */
type SourceState = 'ok' | 'degraded' | 'down' | 'unknown'

/** In-file building block (composed into the exported report) — knip flags type
 *  exports consumed only in their own file. The dashboard mirrors this shape in
 *  `apps/dashboard-manager/src/lib/telemetry.ts`, as it does for every other
 *  internal endpoint. */
type SourceStatus = {
  source: string
  state: SourceState
  /** Runs that actually called this source (or failed trying). */
  runsObserved: number
  runsDegraded: number
  /** Oldest run of the CURRENT failing streak. Null when not currently failing. */
  degradedSince: Date | null
  /** True when the streak reaches the oldest run we can see — "at least since". */
  degradedSinceIsWindowEdge: boolean
  /** Newest run that exercised the source WITHOUT degrading it. */
  lastOkAt: Date | null
  lastReason: string | null
  /** Machine-readable cause (`quota_exceeded`, `unauthorized`…) when classified. */
  lastCode: string | null
}

export type SourceHealthReport = {
  window: {
    hours: number
    /** Runs in the window carrying a usable source-health payload. */
    runsConsidered: number
    oldestRunAt: Date | null
    newestRunAt: Date | null
  }
  sources: SourceStatus[]
  /** Supervision 30/09 — la LECTURE a échoué : distinct d'une fenêtre sans run
   *  (`runsConsidered: 0`), qui est un fait mesuré. Absent = lecture réussie. */
  unavailable?: true
}

type Options = { now: Date; windowHours: number }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A usable source name, or null. Blank names would render as an "unknown" row
 *  that names nothing an operator can act on. */
function sourceName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** What one run says about its sources: degraded (with cause) + observed. A
 *  payload we cannot read yields null — a corrupt row is not evidence. */
function readRun(sourceHealth: unknown): {
  degraded: Map<string, { reason: string; code: string | null }>
  observed: Set<string>
} | null {
  if (!isRecord(sourceHealth)) return null
  const rawDegraded = sourceHealth.degraded
  const rawObserved = sourceHealth.observed
  if (!Array.isArray(rawDegraded) || !Array.isArray(rawObserved)) return null

  const degraded = new Map<string, { reason: string; code: string | null }>()
  for (const entry of rawDegraded) {
    if (!isRecord(entry)) continue
    const source = sourceName(entry.source)
    if (!source) continue
    // First entry per source wins: the IA records in failure order, and the
    // first failure is the one that explains the rest.
    if (degraded.has(source)) continue
    degraded.set(source, {
      reason: typeof entry.reason === 'string' ? entry.reason : '',
      code: sourceName(entry.code),
    })
  }

  const observed = new Set<string>()
  for (const entry of rawObserved) {
    const source = sourceName(entry)
    if (source) observed.add(source)
  }
  // A source that failed was obviously exercised, even if it never reached the
  // provider call counter (an auth refusal fails before the first request).
  for (const source of degraded.keys()) observed.add(source)

  return { degraded, observed }
}

/** Worst first: an operator opens this screen to find the outage, not to read
 *  an alphabetical inventory. */
const STATE_RANK: Record<SourceState, number> = { down: 0, degraded: 1, unknown: 2, ok: 3 }

export function aggregateSourceHealth(runs: SourceHealthRun[], options: Options): SourceHealthReport {
  const { now, windowHours } = options
  const cutoff = now.getTime() - windowHours * 3_600_000

  // Newest first — every rule below ("the most recent run", "the current
  // streak") is expressed in that order.
  const usable = runs
    .filter(r => r.createdAt instanceof Date && r.createdAt.getTime() >= cutoff)
    .map(r => ({ createdAt: r.createdAt, read: readRun(r.sourceHealth) }))
    .filter((r): r is { createdAt: Date; read: NonNullable<ReturnType<typeof readRun>> } => r.read !== null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const window = {
    hours: windowHours,
    runsConsidered: usable.length,
    newestRunAt: usable.length > 0 ? usable[0].createdAt : null,
    oldestRunAt: usable.length > 0 ? usable[usable.length - 1].createdAt : null,
  }
  if (usable.length === 0) return { window, sources: [] }

  const names = new Set<string>()
  for (const r of usable) for (const s of r.read.observed) names.add(s)

  const sources: SourceStatus[] = []
  for (const source of names) {
    // Only the runs that actually exercised this source can testify about it.
    const touching = usable.filter(r => r.read.observed.has(source))
    if (touching.length === 0) continue

    const runsDegraded = touching.filter(r => r.read.degraded.has(source)).length
    const newestIsDegraded = touching[0].read.degraded.has(source)

    // The current unbroken failing streak, walking newest → oldest.
    let streak = 0
    while (streak < touching.length && touching[streak].read.degraded.has(source)) streak += 1

    const lastOk = touching.find(r => !r.read.degraded.has(source)) ?? null
    const newestFailure = touching.find(r => r.read.degraded.has(source))
    const cause = newestFailure?.read.degraded.get(source) ?? null

    const state: SourceState = !newestIsDegraded ? 'ok' : runsDegraded === touching.length ? 'down' : 'degraded'

    sources.push({
      source,
      state,
      runsObserved: touching.length,
      runsDegraded,
      degradedSince: newestIsDegraded ? touching[streak - 1].createdAt : null,
      // The streak swallowed every run we can see: the failure may well be older
      // than the window, so the only honest phrasing is "at least since".
      degradedSinceIsWindowEdge: newestIsDegraded && streak === touching.length,
      lastOkAt: lastOk?.createdAt ?? null,
      lastReason: cause?.reason || null,
      lastCode: cause?.code ?? null,
    })
  }

  sources.sort(
    (a, b) =>
      STATE_RANK[a.state] - STATE_RANK[b.state] || b.runsDegraded - a.runsDegraded || a.source.localeCompare(b.source),
  )
  return { window, sources }
}
