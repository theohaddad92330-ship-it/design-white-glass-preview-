import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJSONStorage } from 'zustand/middleware'
import { SessionContext, type SessionContextValue } from '@/features/auth/session-context'
import { useAnalysisStore } from '@/stores/analysisStore'
import { useAnalysisProgress } from './useAnalysisProgress'

// Override the global mock from test/setup.ts which only exposes legacy
// connectToJob/disconnectSocket. Capture the handlers so we can fire them.
const subscribeToAccount = vi.fn<(accountId: string, handlers: Record<string, unknown>) => () => void>(() => () => {})
vi.mock('@/lib/socket', () => ({
  subscribeToAccount: (accountId: string, handlers: Record<string, unknown>) => subscribeToAccount(accountId, handlers),
}))

// Mock apiFetch — the bootstrap GET /analysis/status/:id call lives here.
const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...(args as Parameters<typeof apiFetch>)),
}))

const ACCOUNT_ID = 'acct-1'
const JOB_ID = 'job-1'

function wrapper(): (props: { children: ReactNode }) => ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } })
  const session: SessionContextValue = {
    user: { id: 'u-1', email: 'u@example.com' } as SessionContextValue['user'],
    loading: false,
  }
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    </QueryClientProvider>
  )
}

beforeAll(() => {
  // jsdom's localStorage occasionally breaks Zustand's persist middleware
  // (`storage.setItem is not a function`). Swap to a no-op storage for tests.
  useAnalysisStore.persist.setOptions({
    storage: createJSONStorage(() => ({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    })),
  })
})

describe('useAnalysisProgress', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ runs: {} })
    subscribeToAccount.mockClear()
    apiFetch.mockReset()
  })

  it('does not subscribe when the account is not analyzing', () => {
    const { result } = renderHook(() => useAnalysisProgress(ACCOUNT_ID, 'completed'), { wrapper: wrapper() })

    expect(subscribeToAccount).not.toHaveBeenCalled()
    expect(result.current.isWatching).toBe(false)
    expect(result.current.state).toBe('idle')
  })

  // #4411 — relance depuis la fiche : le détail en cache est encore `completed`
  // (ancienne analyse) alors que le store porte déjà le run neuf.
  it('subscribes and reports watching when the cached status is completed but the store holds a run in flight (#4411)', () => {
    useAnalysisStore.getState().start(ACCOUNT_ID, JOB_ID, 'Acme')

    const { result } = renderHook(() => useAnalysisProgress(ACCOUNT_ID, 'completed'), { wrapper: wrapper() })

    expect(subscribeToAccount).toHaveBeenCalledTimes(1)
    expect(result.current.isWatching).toBe(true)
  })

  it('stays idle on a completed cache when the stored run is itself finished (#4411)', () => {
    useAnalysisStore.getState().start(ACCOUNT_ID, JOB_ID, 'Acme')
    useAnalysisStore.getState().setComplete(ACCOUNT_ID)

    const { result } = renderHook(() => useAnalysisProgress(ACCOUNT_ID, 'completed'), { wrapper: wrapper() })

    expect(subscribeToAccount).not.toHaveBeenCalled()
    expect(result.current.isWatching).toBe(false)
  })

  it('subscribes to the WS even when a run already exists in the store (regression for nav bug)', () => {
    // Simulate the user landing on AccountDetail after starting the analysis
    // from Search — the run is already persisted in the Zustand store with
    // some progress. The old code skipped the subscribe in this case and the
    // page stayed frozen on the last percent.
    useAnalysisStore.getState().start(ACCOUNT_ID, JOB_ID, 'Acme')
    useAnalysisStore.getState().setProgress(ACCOUNT_ID, { phase: 'Croisement', percent: 22 })

    renderHook(() => useAnalysisProgress(ACCOUNT_ID, 'analyzing'), { wrapper: wrapper() })

    expect(subscribeToAccount).toHaveBeenCalledTimes(1)
    expect(subscribeToAccount).toHaveBeenCalledWith(ACCOUNT_ID, expect.any(Object))
    // The bootstrap GET must NOT fire when the store already has a run.
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('cold-loads via /analysis/status before subscribing when the store is empty', async () => {
    apiFetch.mockResolvedValueOnce({ jobId: JOB_ID, state: 'active', percent: 22, phase: 'collecting' })

    renderHook(() => useAnalysisProgress(ACCOUNT_ID, 'analyzing'), { wrapper: wrapper() })

    await waitFor(() => expect(subscribeToAccount).toHaveBeenCalledTimes(1))
    expect(apiFetch).toHaveBeenCalledWith({ path: `/analysis/status/${ACCOUNT_ID}` })

    const run = useAnalysisStore.getState().runs[ACCOUNT_ID]!
    expect(run.jobId).toBe(JOB_ID)
    expect(run.percent).toBe(22)
    expect(run.phase).toBe('Recherche et sources…')
  })

  it('does not subscribe if the bootstrap reports the run already finished', async () => {
    apiFetch.mockResolvedValueOnce({ jobId: JOB_ID, state: 'completed', percent: 100, phase: 'analysis_done' })

    renderHook(() => useAnalysisProgress(ACCOUNT_ID, 'analyzing'), { wrapper: wrapper() })

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(subscribeToAccount).not.toHaveBeenCalled()
  })

  it('returns the run state from the store while watching', () => {
    useAnalysisStore.getState().start(ACCOUNT_ID, JOB_ID, 'Acme')
    useAnalysisStore.getState().setProgress(ACCOUNT_ID, { phase: 'Collecte', percent: 33 })

    const { result } = renderHook(() => useAnalysisProgress(ACCOUNT_ID, 'analyzing'), { wrapper: wrapper() })

    expect(result.current.isWatching).toBe(true)
    // #3666 (Louis 13/10) — le jalon de heartbeat ne sort pas du hook.
    expect(result.current).not.toHaveProperty('percent')
    expect(result.current.phase).toBe('Collecte')
  })

  it('unsubscribes on unmount', () => {
    const unsub = vi.fn()
    subscribeToAccount.mockReturnValueOnce(unsub)
    useAnalysisStore.getState().start(ACCOUNT_ID, JOB_ID, 'Acme')

    const { unmount } = renderHook(() => useAnalysisProgress(ACCOUNT_ID, 'analyzing'), { wrapper: wrapper() })

    expect(unsub).not.toHaveBeenCalled()
    unmount()
    expect(unsub).toHaveBeenCalledTimes(1)
  })
})
