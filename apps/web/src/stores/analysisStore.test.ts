import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createJSONStorage } from 'zustand/middleware'
import { isRunStale, STALE_RUN_MS, useAnalysisStore } from './analysisStore'

// jsdom's localStorage occasionally breaks Zustand's persist middleware
// (`storage.setItem is not a function`). Swap to a no-op storage for tests —
// same trick as analysis-subscription.test.ts.
beforeAll(() => {
  useAnalysisStore.persist.setOptions({
    storage: createJSONStorage(() => ({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    })),
  })
})

beforeEach(() => {
  useAnalysisStore.setState({ runs: {} })
})

const NOW = 1_700_000_000_000

type Run = ReturnType<typeof makeRun>

/** Build a full persisted run whose only event carries `lastEventAt`. */
function makeRun(overrides: {
  state?: string
  lastEventAt?: number
  events?: Array<{ at: number }>
  accountId?: string
}) {
  const { state = 'analyzing', lastEventAt = NOW, events, accountId = 'acct-1' } = overrides
  return {
    jobId: 'job-1',
    accountId,
    companyName: 'Acme',
    state,
    phase: 'Collecting',
    percent: 10,
    error: null,
    completedSteps: [],
    currentStep: 'scope',
    events: events ?? [{ at: lastEventAt, label: 'started', percent: 0, status: 'running', key: 'analysis_start' }],
    warnings: [],
    sourceHealth: {},
  }
}

function seed(runs: Record<string, Run>): void {
  // The store's `runs` is `Record<string, AnalysisRun>`; the test factory builds
  // the full shape so this assignment is structurally sound.
  useAnalysisStore.setState({ runs: runs as never })
}

describe('isRunStale', () => {
  it('is NOT stale exactly at the ceiling, but IS stale one ms past it', () => {
    const atCeiling = makeRun({ state: 'analyzing', lastEventAt: NOW - STALE_RUN_MS })
    const pastCeiling = makeRun({ state: 'analyzing', lastEventAt: NOW - STALE_RUN_MS - 1 })

    expect(isRunStale(atCeiling, NOW)).toBe(false)
    expect(isRunStale(pastCeiling, NOW)).toBe(true)
  })

  it('treats a `starting` run past the ceiling as stale', () => {
    const stale = makeRun({ state: 'starting', lastEventAt: NOW - STALE_RUN_MS - 1 })
    expect(isRunStale(stale, NOW)).toBe(true)
  })

  it('never marks a terminal run stale, however ancient', () => {
    const ancient = NOW - STALE_RUN_MS * 100
    expect(isRunStale(makeRun({ state: 'completed', lastEventAt: ancient }), NOW)).toBe(false)
    expect(isRunStale(makeRun({ state: 'error', lastEventAt: ancient }), NOW)).toBe(false)
    expect(isRunStale(makeRun({ state: 'idle', lastEventAt: ancient }), NOW)).toBe(false)
  })

  it('treats an in-flight run with no events as stale (no heartbeat proof)', () => {
    const noEvents = makeRun({ state: 'analyzing', events: [] })
    expect(isRunStale(noEvents, NOW)).toBe(true)
  })

  it('keeps a genuinely fresh in-flight run (recent event) alive', () => {
    const fresh = makeRun({ state: 'analyzing', lastEventAt: NOW - 1_000 })
    expect(isRunStale(fresh, NOW)).toBe(false)
  })
})

describe('pruneStale', () => {
  it('evicts stale orphans while keeping fresh in-flight runs', () => {
    seed({
      stale: makeRun({ accountId: 'stale', state: 'analyzing', lastEventAt: NOW - STALE_RUN_MS - 1 }),
      fresh: makeRun({ accountId: 'fresh', state: 'analyzing', lastEventAt: NOW - 1_000 }),
    })

    useAnalysisStore.getState().pruneStale(NOW)

    const runs = useAnalysisStore.getState().runs
    expect(Object.keys(runs)).toEqual(['fresh'])
  })

  it('keeps terminal runs even when they are old', () => {
    seed({
      done: makeRun({ accountId: 'done', state: 'completed', lastEventAt: NOW - STALE_RUN_MS * 10 }),
    })

    useAnalysisStore.getState().pruneStale(NOW)

    expect(Object.keys(useAnalysisStore.getState().runs)).toEqual(['done'])
  })

  it('returns the SAME runs reference when nothing is stale (no-op)', () => {
    seed({
      fresh: makeRun({ accountId: 'fresh', state: 'analyzing', lastEventAt: NOW - 1_000 }),
    })
    const before = useAnalysisStore.getState().runs

    useAnalysisStore.getState().pruneStale(NOW)

    expect(useAnalysisStore.getState().runs).toBe(before)
  })
})

// #2164.4/.5/.6 — l'avancement suit l'ORDRE D'AFFICHAGE ; étape non émise ⇒ ni cochée ni comptée.
describe('ordre d’affichage — étapes de fin d’enum', () => {
  const S = () => useAnalysisStore.getState()
  it('reuse_existing émise en 1er ne coche rien ; scope la coche', () => {
    S().start('a', 'j', 'Acme')
    S().setCurrentStep('a', 'reuse_existing')
    expect(S().runs.a.completedSteps).toEqual([])
    S().setCurrentStep('a', 'scope')
    expect(S().runs.a.completedSteps).toEqual(['reuse_existing'])
  })
  it('étape facultative absente : jamais cochée, même quand l’étape suivante est atteinte', () => {
    S().start('a', 'j', 'Acme')
    S().setCurrentStep('a', 'account_sheet')
    expect(S().runs.a.completedSteps).toEqual(['scope', 'crosscheck'])
    S().markStepCompleted('a', 'account_sheet')
    expect(S().runs.a.completedSteps).not.toContain('thematic_research')
    S().setComplete('a')
    expect(S().runs.a.completedSteps).not.toContain('reuse_existing')
    expect(S().runs.a.completedSteps).toHaveLength(9)
  })
  it('current_research émise coche scope et reuse seulement', () => {
    S().start('a', 'j', 'Acme')
    S().setCurrentStep('a', 'reuse_existing')
    S().setCurrentStep('a', 'current_research')
    expect(S().runs.a.completedSteps).toEqual(['reuse_existing', 'scope'])
  })
})
