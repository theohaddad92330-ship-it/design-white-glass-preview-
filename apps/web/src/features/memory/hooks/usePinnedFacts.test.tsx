import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { usePinnedFacts } from './usePinnedFacts'

// `@/lib/api` is globally mocked in test/setup.ts; grab the mock to drive it.
const apiFetchMock = vi.mocked(apiFetch)

// A session with a user so the query is enabled.
vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('usePinnedFacts', () => {
  beforeEach(() => apiFetchMock.mockReset())

  it('reads the workspace facts for the active account', async () => {
    apiFetchMock.mockResolvedValueOnce({
      facts: [{ id: 'f-1', fact: 'Budget IT voté', accountId: null, createdAt: 'now' }],
    })
    const { result } = renderHook(() => usePinnedFacts('a-1'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiFetchMock).toHaveBeenCalledWith({ path: '/memory/facts?accountId=a-1' })
    expect(result.current.data).toEqual([{ id: 'f-1', fact: 'Budget IT voté', accountId: null, createdAt: 'now' }])
  })

  it('omits the accountId query param when no account is active', async () => {
    apiFetchMock.mockResolvedValueOnce({ facts: [] })
    const { result } = renderHook(() => usePinnedFacts(null), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiFetchMock).toHaveBeenCalledWith({ path: '/memory/facts' })
  })

  it('degrades to [] when the response has no facts (demo-mode benign fallback)', async () => {
    apiFetchMock.mockResolvedValueOnce({})
    const { result } = renderHook(() => usePinnedFacts('a-1'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })
})
