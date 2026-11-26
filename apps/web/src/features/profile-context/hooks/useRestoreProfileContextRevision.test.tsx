import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { useRestoreProfileContextRevision } from './useRestoreProfileContextRevision'

const apiFetchMock = vi.mocked(apiFetch)

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useRestoreProfileContextRevision', () => {
  beforeEach(() => apiFetchMock.mockReset())

  it('POSTs the restore for the target version', async () => {
    apiFetchMock.mockResolvedValueOnce({
      version: 3,
      schema_version: 1,
      created_at: '2026-07-18T10:00:00Z',
      was_last_validated: false,
      profile_context: {},
    })

    const { result } = renderHook(() => useRestoreProfileContextRevision(), { wrapper: wrapper() })
    result.current.mutate(3)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiFetchMock).toHaveBeenCalledWith({ path: '/profile-context/revisions/3/restore', method: 'POST' })
  })

  it('surfaces the error state on failure', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('nope'))
    const { result } = renderHook(() => useRestoreProfileContextRevision(), { wrapper: wrapper() })
    result.current.mutate(1)
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
