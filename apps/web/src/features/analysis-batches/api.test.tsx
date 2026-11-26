import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisBatch } from '@bellum/contracts'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))

const { useAnalysisBatches } = await import('./api')

const lot = (status: AnalysisBatch['status']) => ({ id: 'b1', status }) as AnalysisBatch

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useAnalysisBatches', () => {
  afterEach(() => {
    vi.useRealTimers()
    apiFetch.mockReset()
  })

  // #4671.2 — « 1 en cours » retombe sans recharger : tant qu'un lot tourne, la liste se relit seule.
  it('relit la liste tant qu’un lot est en cours, puis s’arrête', async () => {
    apiFetch.mockResolvedValueOnce([lot('running')]).mockResolvedValue([lot('finished')])
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = renderHook(() => useAnalysisBatches(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.data?.[0]?.status).toBe('running'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_100)
    })
    await waitFor(() => expect(result.current.data?.[0]?.status).toBe('finished'))
    const calls = apiFetch.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(apiFetch.mock.calls.length).toBe(calls)
  })
})
