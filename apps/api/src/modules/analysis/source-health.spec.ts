import { aggregateSourceHealth, type SourceHealthRun } from './source-health'

/**
 * The rules this file defends, in order of how badly getting them wrong would
 * hurt:
 *
 *  1. "no data" is NOT "source down". A company that isn't hiring and a France
 *     Travail outage must never produce the same status.
 *  2. Silence is not health. If nothing exercised a source, its state is
 *     `unknown` — never `ok`. Inventing a green light from an absence of signal
 *     is exactly how the last outage stayed invisible.
 *  3. No invented history. "Degraded since" may only be read off real run
 *     timestamps, and when the streak runs off the edge of the window we say
 *     "at least since", not "since".
 */

const HOUR = 3_600_000
const NOW = new Date('2026-07-20T12:00:00Z')

/** A run at `hoursAgo`, with the given degraded sources and observed sources. */
function run(hoursAgo: number, degraded: Array<[string, string, string?]>, observed: string[]): SourceHealthRun {
  return {
    createdAt: new Date(NOW.getTime() - hoursAgo * HOUR),
    sourceHealth: {
      degraded: degraded.map(([source, reason, code]) => ({ source, reason, ...(code ? { code } : {}) })),
      observed,
    },
  }
}

function statusOf(report: ReturnType<typeof aggregateSourceHealth>, source: string) {
  return report.sources.find(s => s.source === source)
}

describe('aggregateSourceHealth', () => {
  // ── Rule 2: silence is not health ─────────────────────────────────────────

  it('reports NOTHING when no run carries a source-health payload', () => {
    const report = aggregateSourceHealth([], { now: NOW, windowHours: 24 })

    expect(report.sources).toEqual([])
    expect(report.window.runsConsidered).toBe(0)
  })

  it('never invents an "ok" for a source no run touched', () => {
    const report = aggregateSourceHealth([run(1, [], ['brave'])], { now: NOW, windowHours: 24 })

    // Pappers was not exercised — it must not appear at all, and certainly not green.
    expect(statusOf(report, 'pappers')).toBeUndefined()
    expect(statusOf(report, 'brave')?.state).toBe('ok')
  })

  it('exposes the window so the caller can say "we do not know" rather than "all good"', () => {
    const report = aggregateSourceHealth([run(3, [], ['brave'])], { now: NOW, windowHours: 24 })

    expect(report.window.runsConsidered).toBe(1)
    expect(report.window.newestRunAt).toEqual(new Date(NOW.getTime() - 3 * HOUR))
    expect(report.window.oldestRunAt).toEqual(new Date(NOW.getTime() - 3 * HOUR))
  })

  // ── Rule 1: a degradation is positive evidence, an empty result is not ────

  it('marks a source down when every run that touched it degraded it', () => {
    const report = aggregateSourceHealth(
      [
        run(1, [['pappers', 'quota de jetons atteint', 'quota_exceeded']], ['pappers']),
        run(2, [['pappers', 'quota de jetons atteint', 'quota_exceeded']], ['pappers']),
      ],
      { now: NOW, windowHours: 24 },
    )

    const pappers = statusOf(report, 'pappers')
    expect(pappers?.state).toBe('down')
    expect(pappers?.runsObserved).toBe(2)
    expect(pappers?.runsDegraded).toBe(2)
  })

  it('surfaces the typed cause, not a generic "erreur"', () => {
    // The live case this work was commissioned for: the Pappers key is 401 on a
    // spent quota. The screen has to say "quota", not "unknown error".
    const report = aggregateSourceHealth(
      [run(1, [['pappers', 'recherche par nom: quota de jetons atteint', 'quota_exceeded']], ['pappers'])],
      { now: NOW, windowHours: 24 },
    )

    expect(statusOf(report, 'pappers')?.lastCode).toBe('quota_exceeded')
    expect(statusOf(report, 'pappers')?.lastReason).toContain('quota')
  })

  it('calls a source degraded (not down) when it still succeeds sometimes', () => {
    const report = aggregateSourceHealth([run(1, [['brave', 'timeout']], ['brave']), run(2, [], ['brave'])], {
      now: NOW,
      windowHours: 24,
    })

    expect(statusOf(report, 'brave')?.state).toBe('degraded')
  })

  it('calls a source ok again once the most recent run succeeded, but keeps the count', () => {
    const report = aggregateSourceHealth([run(1, [], ['brave']), run(5, [['brave', 'timeout']], ['brave'])], {
      now: NOW,
      windowHours: 24,
    })

    const brave = statusOf(report, 'brave')
    expect(brave?.state).toBe('ok')
    // The blip stays visible — recovering is not the same as never having failed.
    expect(brave?.runsDegraded).toBe(1)
  })

  it('counts a degraded source as observed even when it is missing from observed[]', () => {
    // A source that failed before its first call may never reach the provider
    // counter. It obviously WAS exercised.
    const report = aggregateSourceHealth([run(1, [['inpi', 'login refusé', 'unauthorized']], [])], {
      now: NOW,
      windowHours: 24,
    })

    expect(statusOf(report, 'inpi')?.runsObserved).toBe(1)
    expect(statusOf(report, 'inpi')?.state).toBe('down')
  })

  it('SIG-C (11/10) — a silent job provider appears NAMED on the internal source-health page, apart from its neighbours', () => {
    // The IA now records each job-board provider under its own name (no more
    // single `job_aggregators` key): the operator page tells a dead key from a
    // throttled one. Internal screen only — the client never sees these names.
    const report = aggregateSourceHealth(
      [
        run(1, [['theirstack', 'HTTP 403', 'unauthorized']], ['theirstack', 'adzuna']),
        run(2, [['theirstack', 'HTTP 403', 'unauthorized']], ['theirstack', 'adzuna']),
      ],
      { now: NOW, windowHours: 24 },
    )

    expect(statusOf(report, 'theirstack')?.state).toBe('down')
    expect(statusOf(report, 'theirstack')?.lastCode).toBe('unauthorized')
    expect(statusOf(report, 'adzuna')?.state).toBe('ok')
  })

  // ── Rule 3: no invented history ───────────────────────────────────────────

  it('dates "degraded since" from the oldest run of the CURRENT streak', () => {
    const report = aggregateSourceHealth(
      [
        run(1, [['pappers', 'quota', 'quota_exceeded']], ['pappers']),
        run(2, [['pappers', 'quota', 'quota_exceeded']], ['pappers']),
        run(3, [['pappers', 'quota', 'quota_exceeded']], ['pappers']),
        run(9, [], ['pappers']), // healthy before that → the streak starts at 3h
      ],
      { now: NOW, windowHours: 24 },
    )

    const pappers = statusOf(report, 'pappers')
    expect(pappers?.degradedSince).toEqual(new Date(NOW.getTime() - 3 * HOUR))
    expect(pappers?.degradedSinceIsWindowEdge).toBe(false)
    expect(pappers?.lastOkAt).toEqual(new Date(NOW.getTime() - 9 * HOUR))
  })

  it('flags "at least since" when the streak reaches the edge of the window', () => {
    // Every run we can see is degraded — the outage may well predate them all.
    // Saying a flat "since 3h" would be asserting something we cannot know.
    const report = aggregateSourceHealth(
      [
        run(1, [['pappers', 'quota', 'quota_exceeded']], ['pappers']),
        run(3, [['pappers', 'quota', 'quota_exceeded']], ['pappers']),
      ],
      { now: NOW, windowHours: 24 },
    )

    const pappers = statusOf(report, 'pappers')
    expect(pappers?.degradedSince).toEqual(new Date(NOW.getTime() - 3 * HOUR))
    expect(pappers?.degradedSinceIsWindowEdge).toBe(true)
    expect(pappers?.lastOkAt).toBeNull()
  })

  it('leaves "degraded since" null for a healthy source', () => {
    const report = aggregateSourceHealth([run(1, [], ['brave'])], { now: NOW, windowHours: 24 })

    expect(statusOf(report, 'brave')?.degradedSince).toBeNull()
  })

  it('ignores runs older than the window', () => {
    const report = aggregateSourceHealth([run(1, [], ['brave']), run(48, [['brave', 'timeout']], ['brave'])], {
      now: NOW,
      windowHours: 24,
    })

    expect(statusOf(report, 'brave')?.runsObserved).toBe(1)
    expect(statusOf(report, 'brave')?.runsDegraded).toBe(0)
  })

  // ── Ordering + defensiveness ──────────────────────────────────────────────

  it('sorts the worst first so an operator reads the outage before the noise', () => {
    const report = aggregateSourceHealth(
      [
        run(1, [['pappers', 'quota', 'quota_exceeded']], ['pappers', 'brave', 'firecrawl']),
        run(2, [['firecrawl', 'timeout']], ['pappers', 'brave', 'firecrawl']),
      ],
      { now: NOW, windowHours: 24 },
    )

    expect(report.sources.map(s => s.source)).toEqual(['pappers', 'firecrawl', 'brave'])
  })

  it('survives a malformed payload without dropping the healthy rows', () => {
    const runs = [
      { createdAt: new Date(NOW.getTime() - HOUR), sourceHealth: null },
      { createdAt: new Date(NOW.getTime() - HOUR), sourceHealth: { degraded: 'nope', observed: 3 } },
      run(2, [], ['brave']),
    ] as unknown as SourceHealthRun[]

    const report = aggregateSourceHealth(runs, { now: NOW, windowHours: 24 })

    expect(statusOf(report, 'brave')?.state).toBe('ok')
    // Only the well-formed run counts — a corrupt row is not evidence of anything.
    expect(report.window.runsConsidered).toBe(1)
  })

  it('drops nameless sources rather than materialising an "unknown" row', () => {
    const report = aggregateSourceHealth([run(1, [['  ', 'boom']], ['  ', 'brave'])], {
      now: NOW,
      windowHours: 24,
    })

    expect(report.sources.map(s => s.source)).toEqual(['brave'])
  })
})
