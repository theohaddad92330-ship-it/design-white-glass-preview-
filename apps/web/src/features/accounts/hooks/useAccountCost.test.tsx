import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { useAccountCost } from './useAccountCost'

const apiFetchMock = vi.mocked(apiFetch)

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useAccountCost', () => {
  beforeEach(() => apiFetchMock.mockReset())

  it('reads the stored cost summary for the account', async () => {
    apiFetchMock.mockResolvedValueOnce({
      account_id: 'a-1',
      api_cost_euros: 1.23,
      analyses_count: 3,
      total_run_cost_euros: 1.5,
      last_run_cost_euros: 0.4,
    })

    const { result } = renderHook(() => useAccountCost('a-1'), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiFetchMock).toHaveBeenCalledWith({ path: '/accounts/a-1/cost' })
    expect(result.current.data?.api_cost_euros).toBe(1.23)
  })

  it('stays disabled (no request) when the caller lacks permission (enabled=false)', () => {
    renderHook(() => useAccountCost('a-1', false), { wrapper: wrapper() })
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('stays disabled when there is no account id', () => {
    renderHook(() => useAccountCost(undefined), { wrapper: wrapper() })
    expect(apiFetchMock).not.toHaveBeenCalled()
  })
})
