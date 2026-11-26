import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { useAccessSummary } from './useAccessSummary'

/**
 * Le résumé d'accessibilité du portefeuille (manque B du 30/08).
 *
 * `raw_analysis.access_barrier` existe déjà par compte ; ce hook lit
 * `GET /accounts/access-summary` (`AccountAccessController`) — une classe
 * A-D par compte, pour tout le workspace — sans rien recalculer.
 */
const apiFetchMock = vi.mocked(apiFetch)

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useAccessSummary', () => {
  beforeEach(() => apiFetchMock.mockReset())

  it('lit le résumé du portefeuille depuis le bon chemin', async () => {
    apiFetchMock.mockResolvedValue([
      { accountId: 'acc-1', accessClass: 'A' },
      { accountId: 'acc-2', accessClass: null },
    ])

    const { result } = renderHook(() => useAccessSummary(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiFetchMock).toHaveBeenCalledWith({ path: '/accounts/access-summary' })
    expect(result.current.data).toEqual([
      { accountId: 'acc-1', accessClass: 'A' },
      { accountId: 'acc-2', accessClass: null },
    ])
  })
})
