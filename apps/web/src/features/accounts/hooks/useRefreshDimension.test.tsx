import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const refreshDimensionMock = vi.fn()
const toastSuccess = vi.fn()
const toastWarning = vi.fn()
const toastError = vi.fn()

vi.mock('@/features/accounts/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/accounts/api')>('@/features/accounts/api')
  return {
    ...actual,
    accountsApi: { ...actual.accountsApi, refreshDimension: (...a: unknown[]) => refreshDimensionMock(...a) },
  }
})

vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    warning: (...a: unknown[]) => toastWarning(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}))

// #2130.63 / #2130.64 — le double du traceur produit ANONYME : jamais
// `accountId` ni la dimension choisie (une stratégie commerciale).
const tracker = vi.hoisted(() => ({ trackActionStarted: vi.fn(), trackActionCompleted: vi.fn() }))
vi.mock('@/lib/product-tracker', () => tracker)

import { useRefreshDimension } from './useRefreshDimension'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  refreshDimensionMock.mockReset()
  toastSuccess.mockReset()
  toastWarning.mockReset()
  toastError.mockReset()
  tracker.trackActionStarted.mockClear()
  tracker.trackActionCompleted.mockClear()
})

describe('useRefreshDimension', () => {
  it('calls the refresh endpoint with the chosen dimension and toasts without any balance (#4463)', async () => {
    refreshDimensionMock.mockResolvedValue({ dimension: 'strategy', remaining: 8 })
    const { result } = renderHook(() => useRefreshDimension('acc-1'), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate('strategy')
    })

    await waitFor(() => expect(refreshDimensionMock).toHaveBeenCalledWith('acc-1', 'strategy'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    // The success toast mentions the human label + the remaining balance.
    const [msg] = toastSuccess.mock.calls[0]!
    expect(String(msg)).toContain('Stratégie')
    expect(String(msg)).not.toMatch(/cr[ée]dit|8/)
  })

  it('shows an upsell warning (not a generic error) on a 402 out-of-credits response', async () => {
    // Real apiFetch stashes the HTTP status on Error.cause.
    refreshDimensionMock.mockRejectedValue(new Error('Crédits épuisés', { cause: 402 }))
    const { result } = renderHook(() => useRefreshDimension('acc-1'), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate('signals')
    })

    await waitFor(() => expect(toastWarning).toHaveBeenCalled())
    expect(toastError).not.toHaveBeenCalled()
  })

  // #2130.63 / #2130.64 — LANCER un rafraîchissement ciblé émet refresh_started,
  // le TERMINER émet refresh_completed. Anonyme, par écran : jamais la
  // dimension choisie (une stratégie commerciale, comme un filtre).
  it('#2130.63 — lancer un rafraîchissement émet refresh_started', async () => {
    refreshDimensionMock.mockResolvedValue({ dimension: 'strategy', remaining: 8 })
    const { result } = renderHook(() => useRefreshDimension('acc-1'), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate('strategy')
    })

    expect(tracker.trackActionStarted).toHaveBeenCalledWith('refresh', '/accounts/$id')
  })

  it('#2130.64 — un rafraîchissement réussi émet refresh_completed', async () => {
    refreshDimensionMock.mockResolvedValue({ dimension: 'strategy', remaining: 8 })
    const { result } = renderHook(() => useRefreshDimension('acc-1'), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate('strategy')
    })

    await waitFor(() => expect(tracker.trackActionCompleted).toHaveBeenCalledWith('refresh', expect.anything()))
  })

  it('#2130.64 — un rafraîchissement en échec n’émet PAS refresh_completed', async () => {
    refreshDimensionMock.mockRejectedValue(new Error('Crédits épuisés', { cause: 402 }))
    const { result } = renderHook(() => useRefreshDimension('acc-1'), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate('signals')
    })

    await waitFor(() => expect(toastWarning).toHaveBeenCalled())
    expect(tracker.trackActionCompleted).not.toHaveBeenCalled()
  })
})
