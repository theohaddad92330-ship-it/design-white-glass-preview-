import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { useVerifySignal } from './useVerifySignal'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))

const apiFetchMock = vi.mocked(apiFetch)

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

// #3206.2 (partiel, épopée #3240) — « Marquer ce signal comme vérifié ».
describe('useVerifySignal', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it('posts the signal identity to /signal-history/verify', async () => {
    apiFetchMock.mockResolvedValueOnce({ verified: true })
    const { result } = renderHook(() => useVerifySignal(), { wrapper: wrapper() })

    result.current.mutate({ accountId: 'acc-1', label: 'Levée de fonds' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/signal-history/verify',
      method: 'POST',
      body: { accountId: 'acc-1', label: 'Levée de fonds' },
    })
    expect(toast.success).toHaveBeenCalledTimes(1)
  })

  it('shows an error toast and no success on failure', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useVerifySignal(), { wrapper: wrapper() })

    result.current.mutate({ accountId: 'acc-1', label: 'Levée de fonds' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledTimes(1)
  })
})
