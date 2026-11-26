import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { useProfileContextRevisions } from './useProfileContextRevisions'

const apiFetchMock = vi.mocked(apiFetch)

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useProfileContextRevisions', () => {
  beforeEach(() => apiFetchMock.mockReset())

  it('lists the profile-context revisions (newest first)', async () => {
    apiFetchMock.mockResolvedValueOnce([
      { version: 2, schema_version: 1, created_at: '2026-07-18T10:00:00Z', was_last_validated: false },
      { version: 1, schema_version: 1, created_at: '2026-07-17T10:00:00Z', was_last_validated: false },
    ])

    const { result } = renderHook(() => useProfileContextRevisions(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiFetchMock).toHaveBeenCalledWith({ path: '/profile-context/revisions' })
    expect(result.current.data).toHaveLength(2)
    expect(result.current.data?.[0].version).toBe(2)
  })

  it('stays disabled when explicitly disabled (enabled=false)', () => {
    renderHook(() => useProfileContextRevisions(false), { wrapper: wrapper() })
    expect(apiFetchMock).not.toHaveBeenCalled()
  })
})
