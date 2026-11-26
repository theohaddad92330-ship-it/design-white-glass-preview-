import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { useEnrichmentConfirm, useEnrichmentPlanEstimate } from './useEnrichmentPlanner'

const apiFetchMock = vi.mocked(apiFetch)

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useEnrichmentPlanEstimate', () => {
  beforeEach(() => apiFetchMock.mockReset())

  it('interroge /enrichment-plan avec les paramètres du mode choisi', async () => {
    apiFetchMock.mockResolvedValueOnce({
      mode: 'next_batch',
      scopeLabel: 'Les prochains contacts les plus utiles',
      contactsTargeted: { status: 'measured', value: 5 },
      waveCount: { status: 'measured', value: 1 },
      waveSize: 50,
      estimatedCredits: { status: 'measured', value: 3 },
    })

    const { result } = renderHook(() => useEnrichmentPlanEstimate('acc-1', { mode: 'next_batch' }), {
      wrapper: wrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/analysis/acc-1/enrichment-plan',
      method: 'POST',
      body: { mode: 'next_batch' },
    })
    expect(result.current.data?.estimatedCredits).toEqual({ status: 'measured', value: 3 })
  })

  it('ne lance AUCUNE requête tant que le mode n’a pas ses paramètres requis (params = null)', () => {
    renderHook(() => useEnrichmentPlanEstimate('acc-1', null), { wrapper: wrapper() })
    expect(apiFetchMock).not.toHaveBeenCalled()
  })
})

describe('useEnrichmentConfirm', () => {
  beforeEach(() => apiFetchMock.mockReset())

  it('POST /enrichment-confirm avec le mode et rend le résultat de la vague', async () => {
    apiFetchMock.mockResolvedValueOnce({ matched: 3, waveSize: 5, creditsDebited: 3, remaining: 0 })

    const { result } = renderHook(() => useEnrichmentConfirm('acc-1'), { wrapper: wrapper() })
    result.current.mutate({ mode: 'next_batch' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/analysis/acc-1/enrichment-confirm',
      method: 'POST',
      body: { mode: 'next_batch' },
    })
    expect(result.current.data).toEqual({ matched: 3, waveSize: 5, creditsDebited: 3, remaining: 0 })
  })

  it('surface l’état d’échec (ex. crédits épuisés)', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('Crédits épuisés'))
    const { result } = renderHook(() => useEnrichmentConfirm('acc-1'), { wrapper: wrapper() })
    result.current.mutate({ mode: 'next_batch' })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
